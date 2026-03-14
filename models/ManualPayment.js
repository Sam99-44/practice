// models/ManualPayment.js
import mongoose from "mongoose";

const ManualPaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    planType: {
      type: String,
      required: true,
      enum: ["quiz", "lessons"],
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentDate: {
      type: Date,
      required: true,
    },

    paymentReference: {
      type: String,
      required: true,
      trim: true,
    },

    proofUrl: {
      type: String,
      required: true,
      trim: true,
    },

    proofFilename: {
      type: String,
      required: true,
      trim: true,
    },

    originalProofName: {
      type: String,
      required: true,
      trim: true,
    },

    mimeType: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
  {
    timestamps: true,
  }
);

ManualPaymentSchema.index({ createdAt: -1 });
ManualPaymentSchema.index({ email: 1 });
ManualPaymentSchema.index({ paymentReference: 1 });
ManualPaymentSchema.index({ userId: 1, status: 1 });

const ManualPayment = mongoose.model("ManualPayment", ManualPaymentSchema);

export default ManualPayment;
