// models/Payment.js
import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    // PayFast merchant payment id
    m_payment_id: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    plan: {
      type: String,
      enum: ["monthly"],
      default: "monthly"
    },

    amount: {
      type: Number,
      required: true
    },

    status: {
      type: String,
      enum: ["PENDING", "COMPLETE", "FAILED", "CANCELLED"],
      default: "PENDING",
      index: true
    },

    // PayFast payment id
    pf_payment_id: {
      type: String,
      default: ""
    },

    payment_status_raw: {
      type: String,
      default: ""
    },

    // financial info from PayFast
    amount_gross: {
      type: Number,
      default: 0
    },

    amount_fee: {
      type: Number,
      default: 0
    },

    amount_net: {
      type: Number,
      default: 0
    },

    // full ITN payload snapshot
    raw: {
      type: Object,
      default: {}
    }
  },
  { timestamps: true }
);

export default mongoose.model("Payment", PaymentSchema);
