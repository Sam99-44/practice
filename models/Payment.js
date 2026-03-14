// models/Payment.js
import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    m_payment_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    plan: {
      type: String,
      default: "monthly",
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: ["PENDING", "COMPLETE", "FAILED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },

    payment_status_raw: {
      type: String,
      default: "",
      trim: true,
    },

    pf_payment_id: {
      type: String,
      default: "",
      trim: true,
    },

    amount_gross: {
      type: Number,
      default: 0,
    },

    amount_fee: {
      type: Number,
      default: 0,
    },

    amount_net: {
      type: Number,
      default: 0,
    },

    raw: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("Payment", PaymentSchema);

export default Payment;
