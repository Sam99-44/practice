// routes/access.js
import express from "express";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/activate-paid-access", protect, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    const { months = 1, paymentId = "" } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const monthsNum = Number(months);
    if (!Number.isFinite(monthsNum) || monthsNum < 1) {
      return res.status(400).json({ message: "Months must be at least 1" });
    }

    const now = new Date();

    const base =
      user.paidUntil && new Date(user.paidUntil) > now
        ? new Date(user.paidUntil)
        : now;

    const paidUntil = new Date(base);
    paidUntil.setMonth(paidUntil.getMonth() + monthsNum);

    user.subscriptionStatus = "active";
    user.paidUntil = paidUntil;
    user.lastPaymentId = paymentId || user.lastPaymentId || "";
    user.trialActive = false;

    await user.save();

    res.json({
      message: "Paid access activated successfully",
      paidUntil: user.paidUntil,
      subscriptionStatus: user.subscriptionStatus,
    });

  } catch (error) {
    console.error("activate-paid-access error:", error);
    res.status(500).json({
      message: "Failed to activate paid access"
    });
  }
});

export default router;
