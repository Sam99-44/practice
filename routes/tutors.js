// routes/tutors.js

import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import Employee from "../models/Employee.js";
import TutorDocument from "../models/TutorDocument.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsRoot = path.join(__dirname, "..", "uploads");
const tutorDocsDir = path.join(uploadsRoot, "tutor-documents");

fs.mkdirSync(tutorDocsDir, { recursive: true });

const allowedRoles = ["admin", "tester", "academic", "editor", "tutor"];

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Missing token." });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token." });
  }
}

async function tutorOnly(req, res, next) {
  try {
    const employee = await Employee.findById(req.user.userId).select(
      "fullName username email role department employeeNumber jobTitle isActive"
    );

    if (!employee) {
      return res.status(401).json({ message: "Employee not found." });
    }

    if (!employee.isActive) {
      return res.status(403).json({
        message: "Employee account is disabled.",
      });
    }

    const role = String(employee.role || "").toLowerCase();

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        message: "Tutor/academic/admin access only.",
      });
    }

    req.tutor = employee;
    next();
  } catch (error) {
    console.error("tutorOnly error:", error.message);
    return res.status(500).json({ message: "Server error." });
  }
}

function clean(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function docType(value = "") {
  const type = String(value || "").toLowerCase().trim();

  const allowedTypes = [
    "homework",
    "notes",
    "worksheet",
    "memo",
    "assignment",
    "test",
    "exam",
    "study guide",
    "other",
  ];

  return allowedTypes.includes(type) ? type : "homework";
}

function normalizeStatus(value = "") {
  const v = String(value || "").trim().toLowerCase();

  if (v === "draft") return "Draft";
  if (v === "published") return "Published";
  if (v === "archived") return "Archived";

  return "Published";
}

function normalizeVisibility(value = "") {
  const v = String(value || "").trim().toLowerCase();

  if (v === "tutor only") return "Tutor Only";
  return "Learners";
}

function buildFilter(req, adminView = false) {
  const filter = {};

  if (!adminView) {
    filter.status = "Published";
    filter.isPublished = true;
  }

  const grade = Number(req.query.grade);

  if (Number.isInteger(grade) && grade >= 8 && grade <= 12) {
    filter.grade = grade;
  }

  if (req.query.subject) {
    filter.subject = new RegExp(clean(req.query.subject), "i");
  }

  if (req.query.documentType || req.query.type) {
    filter.documentType = docType(req.query.documentType || req.query.type);
  }

  if (req.query.status) {
    filter.status = normalizeStatus(req.query.status);
  }

  if (req.query.visibility) {
    filter.visibility = normalizeVisibility(req.query.visibility);
  }

  if (req.query.q || req.query.search) {
    const q = clean(req.query.q || req.query.search);
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    filter.$or = [
      { title: rx },
      { subject: rx },
      { description: rx },
      { documentType: rx },
      { originalName: rx },
    ];
  }

  return filter;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tutorDocsDir);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();

    const safeExt = [
      ".doc",
      ".docx",
      ".pdf",
      ".ppt",
      ".pptx",
      ".xls",
      ".xlsx",
    ].includes(ext)
      ? ext
      : ".docx";

    cb(null, `tutor-${req.user.userId}-${Date.now()}${safeExt}`);
  },
});

function filter(req, file, cb) {
  const allowedMimeTypes = [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/pdf",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error("Only Word, PDF, PowerPoint and Excel files allowed."));
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter: filter,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

/* ------------------ CURRENT TUTOR ------------------ */

router.get("/me", authRequired, tutorOnly, (req, res) => {
  return res.json({
    _id: req.tutor._id,
    fullName: req.tutor.fullName || "",
    username: req.tutor.username || "",
    email: req.tutor.email || "",
    role: req.tutor.role || "",
    department: req.tutor.department || "",
    employeeNumber: req.tutor.employeeNumber || "",
    jobTitle: req.tutor.jobTitle || "",
  });
});

/* ------------------ DASHBOARD STATS ------------------ */

router.get("/documents/stats", authRequired, tutorOnly, async (req, res) => {
  try {
    const docs = await TutorDocument.find({}).lean();

    return res.json({
      total: docs.length,
      homework: docs.filter((d) => d.documentType === "homework").length,
      notes: docs.filter((d) =>
        ["notes", "study guide"].includes(d.documentType)
      ).length,
      published: docs.filter((d) => d.status === "Published").length,
      draft: docs.filter((d) => d.status === "Draft").length,
      archived: docs.filter((d) => d.status === "Archived").length,
    });
  } catch (error) {
    console.error("GET /api/tutors/documents/stats error:", error.message);
    return res.status(500).json({
      message: "Could not load document statistics.",
    });
  }
});

/* ------------------ UPLOAD DOCUMENT ------------------ */

router.post(
  "/documents",
  authRequired,
  tutorOnly,
  upload.single("document"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: "Please upload a document.",
        });
      }

      const title = clean(req.body.title);
      const subject = clean(req.body.subject);
      const grade = Number(req.body.grade);

      if (!title || !subject) {
        return res.status(400).json({
          message: "Title and subject are required.",
        });
      }

      if (!Number.isInteger(grade) || grade < 8 || grade > 12) {
        return res.status(400).json({
          message: "Grade must be 8 to 12.",
        });
      }

      const status = normalizeStatus(req.body.status);
      const visibility = normalizeVisibility(req.body.visibility);

      const document = await TutorDocument.create({
        uploadedBy: req.user.userId,
        title,
        subject,
        grade,
        documentType: docType(req.body.documentType),
        description: clean(req.body.description),
        status,
        visibility,
        originalName: req.file.originalname,
        storedName: req.file.filename,
        fileUrl: `/uploads/tutor-documents/${req.file.filename}`,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        downloads: 0,
        isPublished: status === "Published",
      });

      return res.status(201).json({
        message: "Document uploaded successfully.",
        document,
      });
    } catch (error) {
      console.error("POST /api/tutors/documents error:", error.message);
      return res.status(500).json({
        message: "Could not upload document.",
      });
    }
  }
);

/* ------------------ LIST DOCUMENTS ------------------ */

router.get("/documents", authRequired, async (req, res) => {
  try {
    const adminView = String(req.query.admin || "") === "1";
    const filter = buildFilter(req, adminView);

    const docs = await TutorDocument.find(filter)
      .populate("uploadedBy", "fullName username email role department")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(docs);
  } catch (error) {
    console.error("GET /api/tutors/documents error:", error.message);
    return res.status(500).json({
      message: "Could not load documents.",
    });
  }
});

/* ------------------ MY UPLOADS ------------------ */

router.get("/documents/my", authRequired, tutorOnly, async (req, res) => {
  try {
    const docs = await TutorDocument.find({
      uploadedBy: req.user.userId,
    })
      .populate("uploadedBy", "fullName username email role department")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(docs);
  } catch (error) {
    console.error("GET /api/tutors/documents/my error:", error.message);
    return res.status(500).json({
      message: "Could not load your documents.",
    });
  }
});

/* ------------------ UPDATE DOCUMENT ------------------ */

router.patch("/documents/:id", authRequired, tutorOnly, async (req, res) => {
  try {
    const doc = await TutorDocument.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({
        message: "Document not found.",
      });
    }

    const role = String(req.tutor.role || "").toLowerCase();
    const ownsDocument = String(doc.uploadedBy) === String(req.user.userId);

    if (!ownsDocument && !["admin", "tester", "academic", "editor"].includes(role)) {
      return res.status(403).json({
        message: "You can only update your own uploads.",
      });
    }

    const allowed = [
      "title",
      "subject",
      "grade",
      "documentType",
      "description",
      "status",
      "visibility",
    ];

    for (const key of allowed) {
      if (!(key in req.body)) continue;

      if (key === "grade") {
        const grade = Number(req.body.grade);
        if (!Number.isInteger(grade) || grade < 8 || grade > 12) {
          return res.status(400).json({ message: "Grade must be 8 to 12." });
        }
        doc.grade = grade;
        continue;
      }

      if (key === "documentType") {
        doc.documentType = docType(req.body.documentType);
        continue;
      }

      if (key === "status") {
        doc.status = normalizeStatus(req.body.status);
        doc.isPublished = doc.status === "Published";
        continue;
      }

      if (key === "visibility") {
        doc.visibility = normalizeVisibility(req.body.visibility);
        continue;
      }

      doc[key] = clean(req.body[key]);
    }

    await doc.save();

    const updated = await TutorDocument.findById(doc._id)
      .populate("uploadedBy", "fullName username email role department")
      .lean();

    return res.json({
      message: "Document updated successfully.",
      document: updated,
    });
  } catch (error) {
    console.error("PATCH /api/tutors/documents/:id error:", error.message);
    return res.status(500).json({
      message: "Could not update document.",
    });
  }
});

/* ------------------ DOWNLOAD COUNT ------------------ */

router.patch("/documents/:id/download", authRequired, async (req, res) => {
  try {
    const doc = await TutorDocument.findByIdAndUpdate(
      req.params.id,
      { $inc: { downloads: 1 } },
      { new: true }
    );

    if (!doc) {
      return res.status(404).json({
        message: "Document not found.",
      });
    }

    return res.json({
      message: "Download count updated.",
      downloads: doc.downloads,
    });
  } catch (error) {
    console.error("PATCH /api/tutors/documents/:id/download error:", error.message);
    return res.status(500).json({
      message: "Could not update download count.",
    });
  }
});

/* ------------------ DELETE DOCUMENT ------------------ */

router.delete("/documents/:id", authRequired, tutorOnly, async (req, res) => {
  try {
    const doc = await TutorDocument.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({
        message: "Document not found.",
      });
    }

    const role = String(req.tutor.role || "").toLowerCase();
    const ownsDocument = String(doc.uploadedBy) === String(req.user.userId);

    if (!ownsDocument && !["admin", "tester", "academic"].includes(role)) {
      return res.status(403).json({
        message: "You can only delete your own uploads.",
      });
    }

    const filePath = path.join(tutorDocsDir, doc.storedName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await TutorDocument.deleteOne({
      _id: doc._id,
    });

    return res.json({
      message: "Document deleted successfully.",
    });
  } catch (error) {
    console.error("DELETE /api/tutors/documents/:id error:", error.message);
    return res.status(500).json({
      message: "Could not delete document.",
    });
  }
});

/* ------------------ MULTER ERROR HANDLER ------------------ */

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "File too large. Maximum file size is 20MB.",
      });
    }

    return res.status(400).json({
      message: err.message || "File upload error.",
    });
  }

  if (err) {
    return res.status(400).json({
      message: err.message || "Upload error.",
    });
  }

  next();
});

export default router;
