import mongoose from "mongoose";

const QuoteRequestSchema = new mongoose.Schema(
  {
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

    cellphone: {
      type: String,
      required: true,
      trim: true,
    },

    grade: {
      type: String,
      required: true,
      trim: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    package: {
      type: String,
      required: true,
      trim: true,
    },

    amount: {
      type: Number,
      default: 0,
      min: 0,
    },

    message: {
      type: String,
      default: "",
      trim: true,
    },

    notes: {
      type: String,
      default: "",
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

    status: {
      type: String,
      enum: ["New", "Contacted", "Closed"],
      default: "New",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

QuoteRequestSchema.index({ createdAt: -1 });
QuoteRequestSchema.index({ email: 1 });
QuoteRequestSchema.index({ status: 1 });
QuoteRequestSchema.index({ financeStatus: 1 });
QuoteRequestSchema.index({ contacted: 1, paid: 1 });

const QuoteRequest =
  mongoose.models.QuoteRequest ||
  mongoose.model("QuoteRequest", QuoteRequestSchema);

export default QuoteRequest;
