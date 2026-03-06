import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    m_payment_id: { type: String, required: true, unique: true },
    plan: { type: String, default: "monthly" },
    amount: { type: Number, required: true },

    status: {
      type: String,
      enum: ["PENDING", "COMPLETE", "FAILED", "CANCELLED"],
      default: "PENDING",
    },

    pf_payment_id: { type: String, default: "" },
    payment_status_raw: { type: String, default: "" },

    amount_gross: { type: Number, default: 0 },
    amount_fee: { type: Number, default: 0 },
    amount_net: { type: Number, default: 0 },

    raw: { type: Object, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model("Payment", PaymentSchema);
