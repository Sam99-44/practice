import express from "express";
import QuoteRequest from "../models/QuoteRequest.js";

const router = express.Router();

function isValidEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

router.post("/", async (req, res) => {
  try {
    const {
      fullName,
      email,
      cellphone,
      grade,
      subject,
      package: selectedPackage,
      message,
    } = req.body;

    if (
      !fullName ||
      !email ||
      !cellphone ||
      !grade ||
      !subject ||
      !selectedPackage
    ) {
      return res.status(400).json({
        message: "Please complete all required fields.",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    const quote = await QuoteRequest.create({
      fullName,
      email,
      cellphone,
      grade,
      subject,
      package: selectedPackage,
      message,
    });

    return res.status(201).json({
      message: "Quote request submitted successfully.",
      quoteId: quote._id,
    });
  } catch (err) {
    console.error("Request quote error:", err);

    return res.status(500).json({
      message: "Server error.",
    });
  }
});

export default router;
