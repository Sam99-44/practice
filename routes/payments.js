import express from "express";
import User from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

router.post("/activate-paid-access", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { months = 1, paymentId = "" } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const now = new Date();
    const paidUntil = new Date(now);
    paidUntil.setMonth(paidUntil.getMonth() + Number(months));

    user.subscriptionStatus = "active";
    user.paidUntil = paidUntil;
    user.lastPaymentId = paymentId || user.lastPaymentId || "";
    user.trialActive = false;

    await user.save();

    return res.json({
      message: "Paid access activated successfully",
      paidUntil: user.paidUntil,
      subscriptionStatus: user.subscriptionStatus,
    });
  } catch (error) {
    console.error("activate-paid-access error:", error);
    return res.status(500).json({ message: "Failed to activate paid access" });
  }
});

export default router;
