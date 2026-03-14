// middleware/requireActiveAccess.js
import User from "../models/User.js";
import {
  getAccessStatus,
  getTrialDaysLeft,
  syncUserAccessState,
} from "../utils/access.js";

export async function requireActiveAccess(req, res, next) {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Allow admins through without learner access checks
    if (user.role === "admin") {
      req.currentUser = user;
      req.accessStatus = "admin";
      req.trialDaysLeft = 0;
      return next();
    }

    await syncUserAccessState(user);

    const accessStatus = getAccessStatus(user);

    if (accessStatus === "expired") {
      return res.status(403).json({
        message: "Your free trial has expired. Please subscribe to continue.",
        code: "TRIAL_EXPIRED",
        accessStatus: "expired",
      });
    }

    req.currentUser = user;
    req.accessStatus = accessStatus;
    req.trialDaysLeft = getTrialDaysLeft(user);

    next();
  } catch (error) {
    console.error("requireActiveAccess error:", error);
    return res.status(500).json({
      message: "Failed to verify access",
    });
  }
}
