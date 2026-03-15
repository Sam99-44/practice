import express from "express";
import Announcement from "../models/Announcement.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* -----------------------------
   Helpers
----------------------------- */
function ensureAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied. Admin only." });
  }
  next();
}

const defaultPayload = {
  weeklyFocus: "This week we will be focusing on trigonometry.",
  grades: {
    grade8: {
      weeklyUpdate: "This week we will revise geometry basics and introduce simple trigonometry ideas.",
      meetingLink: "",
      quizAnnouncement: "Complete the Grade 8 geometry practice quiz before Friday."
    },
    grade9: {
      weeklyUpdate: "This week we will focus on algebra patterns and the foundations of trigonometry.",
      meetingLink: "",
      quizAnnouncement: "Complete the Grade 9 algebra practice quiz this week."
    },
    grade10: {
      weeklyUpdate: "This week we will focus on trigonometry including ratios and triangle applications.",
      meetingLink: "",
      quizAnnouncement: "Attempt the trigonometry quiz available on the Practice page."
    },
    grade11: {
      weeklyUpdate: "This week we will work on trigonometric equations and problem solving strategies.",
      meetingLink: "",
      quizAnnouncement: "Complete the trigonometric equations practice quiz this week."
    },
    grade12: {
      weeklyUpdate: "This week we will revise advanced trigonometry and exam style questions.",
      meetingLink: "",
      quizAnnouncement: "Complete the exam preparation quiz available on the Practice page."
    },
    allGrades: {
      weeklyUpdate: "Learners should review notes and attempt the weekly revision quiz.",
      meetingLink: "",
      quizAnnouncement: "All learners are encouraged to attempt the weekly revision quiz."
    }
  }
};

async function getOrCreateActiveAnnouncement() {
  let announcement = await Announcement.findOne({ isActive: true }).sort({ createdAt: -1 });
  if (!announcement) {
    announcement = await Announcement.create(defaultPayload);
  }
  return announcement;
}

/* -----------------------------
   PUBLIC: learners can read
----------------------------- */
router.get("/", async (req, res) => {
  try {
    const announcement = await getOrCreateActiveAnnouncement();
    res.json(announcement);
  } catch (err) {
    console.error("GET /api/announcements error:", err);
    res.status(500).json({ message: "Failed to load announcements." });
  }
});

/* -----------------------------
   ADMIN: read current
----------------------------- */
router.get("/admin/current", protect, ensureAdmin, async (req, res) => {
  try {
    const announcement = await getOrCreateActiveAnnouncement();
    res.json(announcement);
  } catch (err) {
    console.error("GET /api/announcements/admin/current error:", err);
    res.status(500).json({ message: "Failed to load admin announcements." });
  }
});

/* -----------------------------
   ADMIN: update current
----------------------------- */
router.put("/admin/current", protect, ensureAdmin, async (req, res) => {
  try {
    const announcement = await getOrCreateActiveAnnouncement();

    announcement.weeklyFocus = req.body.weeklyFocus || "";

    announcement.grades.grade8.weeklyUpdate = req.body?.grades?.grade8?.weeklyUpdate || "";
    announcement.grades.grade8.meetingLink = req.body?.grades?.grade8?.meetingLink || "";
    announcement.grades.grade8.quizAnnouncement = req.body?.grades?.grade8?.quizAnnouncement || "";

    announcement.grades.grade9.weeklyUpdate = req.body?.grades?.grade9?.weeklyUpdate || "";
    announcement.grades.grade9.meetingLink = req.body?.grades?.grade9?.meetingLink || "";
    announcement.grades.grade9.quizAnnouncement = req.body?.grades?.grade9?.quizAnnouncement || "";

    announcement.grades.grade10.weeklyUpdate = req.body?.grades?.grade10?.weeklyUpdate || "";
    announcement.grades.grade10.meetingLink = req.body?.grades?.grade10?.meetingLink || "";
    announcement.grades.grade10.quizAnnouncement = req.body?.grades?.grade10?.quizAnnouncement || "";

    announcement.grades.grade11.weeklyUpdate = req.body?.grades?.grade11?.weeklyUpdate || "";
    announcement.grades.grade11.meetingLink = req.body?.grades?.grade11?.meetingLink || "";
    announcement.grades.grade11.quizAnnouncement = req.body?.grades?.grade11?.quizAnnouncement || "";

    announcement.grades.grade12.weeklyUpdate = req.body?.grades?.grade12?.weeklyUpdate || "";
    announcement.grades.grade12.meetingLink = req.body?.grades?.grade12?.meetingLink || "";
    announcement.grades.grade12.quizAnnouncement = req.body?.grades?.grade12?.quizAnnouncement || "";

    announcement.grades.allGrades.weeklyUpdate = req.body?.grades?.allGrades?.weeklyUpdate || "";
    announcement.grades.allGrades.meetingLink = req.body?.grades?.allGrades?.meetingLink || "";
    announcement.grades.allGrades.quizAnnouncement = req.body?.grades?.allGrades?.quizAnnouncement || "";

    await announcement.save();

    res.json({
      message: "Announcements updated successfully.",
      announcement
    });
  } catch (err) {
    console.error("PUT /api/announcements/admin/current error:", err);
    res.status(500).json({ message: "Failed to update announcements." });
  }
});

export default router;
