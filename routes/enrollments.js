import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

import User from "../models/User.js";

import {
  employeeAuthRequired,
  departmentRequired,
  writeEmployeeLog,
} from "./employees.js";

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const EnrollmentSchema = new mongoose.Schema(
  {
    learnerNumber: { type: String, required: true, trim: true, index: true },
    learner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    subject: { type: String, default: "Mathematics", trim: true },
    device: { type: String, required: true, trim: true },
    internetAccess: { type: String, required: true, trim: true },
    preferredClassTime: { type: String, required: true, trim: true },

    paymentPlan: {
      type: String,
      default: "Online Mathematics Classes",
      trim: true,
    },

    proofOfPaymentUrl: { type: String, required: true, trim: true },
    proofOfPaymentPublicId: { type: String, default: "", trim: true },
    originalProofName: { type: String, default: "", trim: true },
    mimeType: { type: String, default: "", trim: true },

    additionalNotes: { type: String, default: "", trim: true },

    contacted: { type: Boolean, default: false, index: true },
    paid: { type: Boolean, default: false, index: true },

    financeStatus: {
      type: String,
      enum: ["Pending", "Under Review", "Approved", "Rejected"],
      default: "Pending",
      index: true,
    },

    financeNotes: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

EnrollmentSchema.index({ createdAt: -1 });
EnrollmentSchema.index({ learnerNumber: 1, status: 1 });
EnrollmentSchema.index({ financeStatus: 1 });
EnrollmentSchema.index({ contacted: 1, paid: 1 });

const Enrollment =
  mongoose.models.Enrollment || mongoose.model("Enrollment", EnrollmentSchema);

function clean(value = "") {
  return String(value || "").trim();
}

function normalizeFinanceStatus(value = "") {
  const v = String(value || "").trim().toLowerCase();

  if (v === "under review") return "Under Review";
  if (v === "approved") return "Approved";
  if (v === "rejected") return "Rejected";

  return "Pending";
}

function uploadToCloudinary(buffer, originalname = "") {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "practice-online/proofs",
        resource_type: "auto",
        type: "upload",
        access_mode: "public",
        public_id: `proof-${Date.now()}-${String(originalname)
          .replace(/\.[^/.]+$/, "")
          .replace(/[^a-zA-Z0-9-_]/g, "-")}`,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(buffer);
  });
}

/* PUBLIC/STUDENT: SUBMIT ENROLLMENT */
router.post("/", upload.single("proofOfPayment"), async (req, res) => {
  try {
    const {
      learnerNumber,
      device,
      internetAccess,
      preferredClassTime,
      paymentPlan,
      additionalNotes,
    } = req.body;

    if (!learnerNumber || !device || !internetAccess || !preferredClassTime) {
      return res.status(400).json({
        message: "Please complete all required fields.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Please upload proof of payment.",
      });
    }

    const learner = await User.findOne({
      learnerNumber: clean(learnerNumber),
    }).select("_id learnerNumber fullName email");

    if (!learner) {
      return res.status(404).json({
        message: "Learner number not found.",
      });
    }

    const uploaded = await uploadToCloudinary(
      req.file.buffer,
      req.file.originalname
    );

    const enrollment = await Enrollment.create({
      learnerNumber: clean(learnerNumber),
      learner: learner._id,
      subject: "Mathematics",
      device: clean(device),
      internetAccess: clean(internetAccess),
      preferredClassTime: clean(preferredClassTime),
      paymentPlan: clean(paymentPlan) || "Online Mathematics Classes",

      proofOfPaymentUrl: uploaded.secure_url,
      proofOfPaymentPublicId: uploaded.public_id,
      originalProofName: req.file.originalname || "",
      mimeType: req.file.mimetype || "",

      additionalNotes: clean(additionalNotes),

      contacted: false,
      paid: false,
      financeStatus: "Pending",
      financeNotes: "",
      status: "pending",
    });

    return res.status(201).json({
      message: "Enrollment submitted successfully.",
      enrollment,
    });
  } catch (err) {
    console.error("POST /api/enrollments error:", err);

    return res.status(500).json({
      message: "Could not submit enrollment.",
    });
  }
});

/* FINANCE ADMIN: GET ALL ENROLLMENTS */
router.get(
  "/",
  employeeAuthRequired,
  departmentRequired("finance"),
  async (req, res) => {
    try {
      const filter = {};

      if (req.query.financeStatus) {
        filter.financeStatus = normalizeFinanceStatus(req.query.financeStatus);
      }

      if (req.query.status) {
        filter.status = String(req.query.status).toLowerCase();
      }

      if (req.query.paid === "true") filter.paid = true;
      if (req.query.paid === "false") filter.paid = false;

      if (req.query.contacted === "true") filter.contacted = true;
      if (req.query.contacted === "false") filter.contacted = false;

      if (req.query.q || req.query.search) {
        const term = clean(req.query.q || req.query.search);
        const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

        filter.$or = [
          { learnerNumber: rx },
          { subject: rx },
          { device: rx },
          { internetAccess: rx },
          { preferredClassTime: rx },
          { paymentPlan: rx },
          { additionalNotes: rx },
          { financeNotes: rx },
        ];
      }

      const enrollments = await Enrollment.find(filter)
        .populate(
          "learner",
          "fullName username email learnerNumber grade cellphone guardianCellphone phone"
        )
        .populate("reviewedBy", "fullName username email role")
        .sort({ createdAt: -1 })
        .lean();

      return res.json(enrollments);
    } catch (err) {
      console.error("GET /api/enrollments error:", err);

      return res.status(500).json({
        message: "Could not load enrollments.",
      });
    }
  }
);

/* FINANCE ADMIN: UPDATE / APPROVE / REJECT */
router.patch(
  "/:id",
  employeeAuthRequired,
  departmentRequired("finance"),
  async (req, res) => {
    try {
      const enrollment = await Enrollment.findById(req.params.id);

      if (!enrollment) {
        return res.status(404).json({
          message: "Enrollment not found.",
        });
      }

      if ("contacted" in req.body) {
        enrollment.contacted = !!req.body.contacted;
      }

      if ("paid" in req.body) {
        enrollment.paid = !!req.body.paid;
      }

      if ("financeStatus" in req.body) {
        enrollment.financeStatus = normalizeFinanceStatus(req.body.financeStatus);
      }

      if ("financeNotes" in req.body) {
        enrollment.financeNotes = clean(req.body.financeNotes);
      }

      if ("status" in req.body) {
        const status = String(req.body.status || "").toLowerCase();

        if (["pending", "approved", "rejected"].includes(status)) {
          enrollment.status = status;
        }
      }

      if (enrollment.financeStatus === "Approved" || enrollment.paid) {
        enrollment.financeStatus = "Approved";
        enrollment.status = "approved";
        enrollment.paid = true;
        enrollment.reviewedBy = req.employee?._id || null;
        enrollment.reviewedAt = new Date();
        enrollment.approvedAt = new Date();
      }

      if (enrollment.financeStatus === "Rejected") {
        enrollment.status = "rejected";
        enrollment.paid = false;
        enrollment.reviewedBy = req.employee?._id || null;
        enrollment.reviewedAt = new Date();
      }

      await enrollment.save();

      await writeEmployeeLog(req, "enrollment_payment_updated", {
        enrollmentId: enrollment._id,
        learnerNumber: enrollment.learnerNumber,
        financeStatus: enrollment.financeStatus,
        paid: enrollment.paid,
        contacted: enrollment.contacted,
      });

      return res.json({
        message: "Enrollment updated successfully.",
        enrollment,
      });
    } catch (err) {
      console.error("PATCH /api/enrollments/:id error:", err);

      return res.status(500).json({
        message: "Could not update enrollment.",
      });
    }
  }
);

export default router;
