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
      index: true,
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
      index: true,
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
      index: true,
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

    contacted: {
      type: Boolean,
      default: false,
      index: true,
    },

    paid: {
      type: Boolean,
      default: false,
      index: true,
    },

    financeStatus: {
      type: String,
      enum: [
        "Pending",
        "Awaiting Proof",
        "Under Review",
        "Approved",
        "Rejected",
        "Refunded",
      ],
      default: "Pending",
      index: true,
    },

    financeNotes: {
      type: String,
      trim: true,
      default: "",
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

ManualPaymentSchema.pre("validate", function (next) {
  if (this.financeStatus === "Approved") {
    this.status = "approved";
    this.paid = true;
  }

  if (this.financeStatus === "Rejected") {
    this.status = "rejected";
    this.paid = false;
  }

  next();
});

ManualPaymentSchema.index({ createdAt: -1 });
ManualPaymentSchema.index({ email: 1 });
ManualPaymentSchema.index({ paymentReference: 1 });
ManualPaymentSchema.index({ userId: 1, status: 1 });
ManualPaymentSchema.index({ financeStatus: 1 });
ManualPaymentSchema.index({ contacted: 1, paid: 1 });

const ManualPayment =
  mongoose.models.ManualPayment ||
  mongoose.model("ManualPayment", ManualPaymentSchema);

export default ManualPayment;
