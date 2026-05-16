import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import User from "../models/User.js";
const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage() });

const EnrollmentSchema = new mongoose.Schema(
  {
    learnerNumber: { type: String, required: true, trim: true },
    learner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    subject: { type: String, default: "Mathematics" },
    device: { type: String, required: true },
    internetAccess: { type: String, required: true },
    preferredClassTime: { type: String, required: true },
    paymentPlan: { type: String, required: true },

    proofOfPaymentUrl: { type: String, required: true },
    proofOfPaymentPublicId: { type: String, default: "" },

    additionalNotes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

const Enrollment =
  mongoose.models.Enrollment || mongoose.model("Enrollment", EnrollmentSchema);

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "practice-online/proofs",
        resource_type: "auto",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(buffer);
  });
}

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

    if (!learnerNumber || !device || !internetAccess || !preferredClassTime || !paymentPlan) {
      return res.status(400).json({ message: "Please complete all required fields." });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Please upload proof of payment." });
    }

    const learner = await User.findOne({ learnerNumber }).select("_id learnerNumber");

    if (!learner) {
      return res.status(404).json({ message: "Learner number not found." });
    }

    const uploaded = await uploadToCloudinary(req.file.buffer);

    const enrollment = await Enrollment.create({
      learnerNumber,
      learner: learner._id,
      subject: "Mathematics",
      device,
      internetAccess,
      preferredClassTime,
      paymentPlan,
      proofOfPaymentUrl: uploaded.secure_url,
      proofOfPaymentPublicId: uploaded.public_id,
      additionalNotes: additionalNotes || "",
      status: "pending",
    });

    return res.status(201).json({
      message: "Enrollment submitted successfully.",
      enrollment,
    });
  } catch (err) {
    console.error("Enrollment error:", err);
    return res.status(500).json({ message: "Could not submit enrollment." });
  }
});

export default router;
