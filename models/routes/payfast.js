// routes/payfast.js
import express from "express";
import { generateSignature } from "../utils/payfast.js";

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

router.post("/itn", (req, res) => {
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

    console.log("✅ PayFast payment confirmed:", {
      order: data.m_payment_id,
      amount: data.amount_gross,
      payer: data.email_address
    });

    // TODO:
    // 1. Find order in DB by m_payment_id
    // 2. Mark as paid
    // 3. Unlock premium access

    res.status(200).send("OK");
  } catch (err) {
    console.error("PayFast ITN error:", err.message);
    res.status(500).send("Server error");
  }
});

export default router;
