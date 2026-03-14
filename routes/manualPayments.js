// routes/manualPayments.js
import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import ManualPayment from "../models/ManualPayment.js";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* =========================================================
   UPLOAD SETUP
========================================================= */

const uploadDir = path.join(process.cwd(), "uploads", "payment-proofs");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeBase = path
      .basename(file.originalname || "proof", ext)
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .slice(0, 60);

    cb(null, `${Date.now()}-${safeBase}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "application/pdf",
  ];

  const allowedExts = [".jpg", ".jpeg", ".png", ".pdf"];
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (!allowedMimeTypes.includes(file.mimetype) || !allowedExts.includes(ext)) {
    return cb(new Error("Only PDF, JPG, JPEG, and PNG files are allowed."));
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/* =========================================================
   HELPERS
========================================================= */

function isAdmin(req) {
  return req.user && req.user.role === "admin";
}

function isLearner(req) {
  return req.user && req.user.accountType === "student" && req.user.role !== "admin";
}

function add30Days(fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + 30);
  return d;
}

function buildProofUrl(req, filename) {
  return `${req.protocol}://${req.get("host")}/uploads/payment-proofs/${filename}`;
}

function normalizePlanType(planType) {
  const value = String(planType || "").trim().toLowerCase();
  if (value === "quiz") return "quiz";
  if (value === "lessons") return "lessons";
  return "";
}

function expectedAmountForPlan(planType) {
  if (planType === "quiz") return 95;
  if (planType === "lessons") return 599;
  return null;
}

function parseAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/* =========================================================
   LEARNER: SUBMIT MANUAL PAYMENT
   POST /api/manual-payments/submit
========================================================= */

router.post(
  "/submit",
  protect,
  upload.single("proof"),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Not authorized." });
      }

      if (!isLearner(req)) {
        return res.status(403).json({
          message: "Only learner accounts can submit proof of payment.",
        });
      }

      const {
        fullName,
        email,
        phone = "",
        planType,
        amount,
        paymentDate,
        paymentReference,
      } = req.body;

      const normalizedPlan = normalizePlanType(planType);
      const numericAmount = parseAmount(amount);

      if (!fullName || !String(fullName).trim()) {
        return res.status(400).json({ message: "Full name is required." });
      }

      if (!email || !String(email).trim()) {
        return res.status(400).json({ message: "Email is required." });
      }

      if (!normalizedPlan) {
        return res.status(400).json({ message: "Valid plan type is required." });
      }

      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ message: "Valid amount is required." });
      }

      if (!paymentDate) {
        return res.status(400).json({ message: "Payment date is required." });
      }

      if (!paymentReference || !String(paymentReference).trim()) {
        return res.status(400).json({ message: "Payment reference is required." });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Proof of payment file is required." });
      }

      const expected = expectedAmountForPlan(normalizedPlan);
      if (expected !== null && Number(numericAmount) !== Number(expected)) {
        return res.status(400).json({
          message: `Amount does not match the selected plan. Expected R${expected}.`,
        });
      }

      const existingPending = await ManualPayment.findOne({
        userId: req.user._id,
        status: "pending",
      });

      if (existingPending) {
        return res.status(400).json({
          message: "You already have a pending payment submission awaiting review.",
        });
      }

      const proofUrl = buildProofUrl(req, req.file.filename);

      const payment = await ManualPayment.create({
        userId: req.user._id,
        fullName: String(fullName).trim(),
        email: String(email).trim().toLowerCase(),
        phone: String(phone || "").trim(),
        planType: normalizedPlan,
        amount: numericAmount,
        paymentDate: new Date(paymentDate),
        paymentReference: String(paymentReference).trim(),
        proofUrl,
        proofFilename: req.file.filename,
        originalProofName: req.file.originalname,
        mimeType: req.file.mimetype,
        status: "pending",
      });

      return res.status(201).json({
        message: "Proof of payment submitted successfully. Awaiting verification.",
        payment,
      });
    } catch (err) {
      console.error("Manual payment submit error:", err);
      return res.status(500).json({
        message: err.message || "Could not submit proof of payment.",
      });
    }
  }
);

/* =========================================================
   ADMIN: GET ALL PAYMENTS
   GET /api/manual-payments
========================================================= */

router.get("/", protect, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized." });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Admin access only." });
    }

    const payments = await ManualPayment.find({})
      .populate("userId", "username email")
      .populate("reviewedBy", "username email")
      .sort({ createdAt: -1 });

    return res.json(payments);
  } catch (err) {
    console.error("Get manual payments error:", err);
    return res.status(500).json({
      message: err.message || "Could not load manual payments.",
    });
  }
});

/* =========================================================
   ADMIN: GET SINGLE PAYMENT
   GET /api/manual-payments/:id
========================================================= */

router.get("/:id", protect, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized." });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Admin access only." });
    }

    const payment = await ManualPayment.findById(req.params.id)
      .populate("userId", "username email")
      .populate("reviewedBy", "username email");

    if (!payment) {
      return res.status(404).json({ message: "Payment submission not found." });
    }

    return res.json(payment);
  } catch (err) {
    console.error("Get single manual payment error:", err);
    return res.status(500).json({
      message: err.message || "Could not load payment submission.",
    });
  }
});

/* =========================================================
   ADMIN: APPROVE PAYMENT
   PATCH /api/manual-payments/:id/approve
========================================================= */

router.patch("/:id/approve", protect, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized." });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Admin access only." });
    }

    const payment = await ManualPayment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ message: "Payment submission not found." });
    }

    if (payment.status === "approved") {
      return res.status(400).json({ message: "Payment is already approved." });
    }

    const learner = await User.findById(payment.userId);

    if (!learner) {
      return res.status(404).json({ message: "Learner account not found." });
    }

    const now = new Date();
    const paidUntil = add30Days(now);

    learner.subscriptionStatus = "active";
    learner.subscriptionPlan = payment.planType;
    learner.paidUntil = paidUntil;

    await learner.save();

    payment.status = "approved";
    payment.reviewedBy = req.user._id;
    payment.reviewedAt = now;
    payment.rejectionReason = "";
    payment.approvedAt = now;

    await payment.save();

    const updatedPayment = await ManualPayment.findById(payment._id)
      .populate("userId", "username email")
      .populate("reviewedBy", "username email");

    return res.json({
      message: "Payment approved and learner subscription activated.",
      payment: updatedPayment,
      user: {
        _id: learner._id,
        username: learner.username,
        email: learner.email,
        subscriptionStatus: learner.subscriptionStatus,
        subscriptionPlan: learner.subscriptionPlan,
        paidUntil: learner.paidUntil,
      },
    });
  } catch (err) {
    console.error("Approve manual payment error:", err);
    return res.status(500).json({
      message: err.message || "Could not approve payment.",
    });
  }
});

/* =========================================================
   ADMIN: REJECT PAYMENT
   PATCH /api/manual-payments/:id/reject
========================================================= */

router.patch("/:id/reject", protect, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized." });
    }

    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Admin access only." });
    }

    const { rejectionReason = "" } = req.body || {};

    const payment = await ManualPayment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ message: "Payment submission not found." });
    }

    if (payment.status === "rejected") {
      return res.status(400).json({ message: "Payment is already rejected." });
    }

    payment.status = "rejected";
    payment.rejectionReason = String(rejectionReason || "").trim();
    payment.reviewedBy = req.user._id;
    payment.reviewedAt = new Date();

    await payment.save();

    const updatedPayment = await ManualPayment.findById(payment._id)
      .populate("userId", "username email")
      .populate("reviewedBy", "username email");

    return res.json({
      message: "Payment rejected successfully.",
      payment: updatedPayment,
    });
  } catch (err) {
    console.error("Reject manual payment error:", err);
    return res.status(500).json({
      message: err.message || "Could not reject payment.",
    });
  }
});

/* =========================================================
   MULTER ERROR HANDLER
========================================================= */

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "File too large. Maximum file size is 10MB.",
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
