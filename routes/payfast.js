// routes/payfast.js
import express from "express";
import { generateSignature } from "../utils/payfast.js";
import User from "../models/User.js";

const router = express.Router();

router.post("/create", (req, res) => {
  try {
    const { amount, item_name, orderId, email } = req.body;

    if (!amount || !item_name || !orderId || !email) {
      return res.status(400).json({ message: "Missing payment fields" });
    }

    const isSandbox = process.env.PAYFAST_MODE !== "live";
    const host = isSandbox ? "sandbox.payfast.co.za" : "www.payfast.co.za";

    if (!process.env.PAYFAST_MERCHANT_ID || !process.env.PAYFAST_MERCHANT_KEY) {
      return res.status(500).json({ message: "PayFast not configured on server" });
    }

    const data = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY,

      return_url: `${process.env.APP_URL}/payment-success.html`,
      cancel_url: `${process.env.APP_URL}/payment-cancel.html`,
      notify_url: `${process.env.API_BASE_URL}/api/payfast/itn`,

      m_payment_id: orderId,
      amount: Number(amount).toFixed(2),
      item_name,
      email_address: email
    };

    data.signature = generateSignature(data, process.env.PAYFAST_PASSPHRASE);

    res.json({
      processUrl: `https://${host}/eng/process`,
      data
    });
  } catch (err) {
    console.error("PayFast create error:", err.message);
    res.status(500).json({ message: "Failed to create payment" });
  }
});

// ✅ ITN: unlock premium (>= R95) + set/extend 30-day expiry
router.post("/itn", async (req, res) => {
  try {
    const receivedSignature = req.body.signature;
    if (!receivedSignature) return res.status(400).send("Missing signature");

    const data = { ...req.body };
    delete data.signature;

    const calculated = generateSignature(data, process.env.PAYFAST_PASSPHRASE);

    if (receivedSignature !== calculated) {
      console.warn("❌ PayFast invalid signature:", data.m_payment_id);
      return res.status(400).send("Invalid signature");
    }

    if (data.payment_status !== "COMPLETE") {
      console.log("ℹ️ PayFast payment not complete:", data.payment_status, data.m_payment_id);
      return res.status(200).send("Ignored");
    }

    const paid = Number(String(data.amount_gross || "0").replace(",", "."));
    if (!Number.isFinite(paid)) return res.status(400).send("Invalid amount");

    const MIN_PREMIUM = 95.0;
    if (paid < MIN_PREMIUM) {
      console.log(`ℹ️ Payment below threshold (paid ${paid}) order:`, data.m_payment_id);
      return res.status(200).send("Below threshold");
    }

    const email = (data.email_address || "").trim().toLowerCase();
    if (!email) return res.status(400).send("Missing email");

    const user = await User.findOne({ email });
    if (!user) {
      console.warn("⚠️ Payment for unknown user:", email, "order:", data.m_payment_id);
      return res.status(200).send("User not found");
    }

    const now = new Date();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    const base =
      user.premiumExpiresAt && user.premiumExpiresAt > now
        ? user.premiumExpiresAt
        : now;

    user.premium = true;
    user.premiumActivatedAt = now;
    user.premiumExpiresAt = new Date(base.getTime() + THIRTY_DAYS_MS);

    await user.save();

    console.log("🎉 Premium updated:", {
      email,
      paid,
      order: data.m_payment_id,
      expires: user.premiumExpiresAt.toISOString()
    });

    return res.status(200).send("OK");
  } catch (err) {
    console.error("PayFast ITN error:", err.message);
    return res.status(500).send("Server error");
  }
});

export default router;
