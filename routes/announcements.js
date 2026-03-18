// routes/announcements.js
import express from "express";
import mongoose from "mongoose";
import Announcement from "../models/Announcement.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

function isAdminOrEditor(user) {
  return user && (user.role === "admin" || user.role === "editor");
}

function normalizeGrade(value = "") {
  const v = String(value || "").trim();
  const allowed = ["grade8", "grade9", "grade10", "grade11", "grade12", "allGrades"];
  return allowed.includes(v) ? v : "allGrades";
}

function normalizeCategory(value = "") {
  const v = String(value || "").trim();
  const allowed = ["general", "class", "quiz", "all"];
  return allowed.includes(v) ? v : "general";
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapLearnerResponse(announcement, userId) {
  const responses = Array.isArray(announcement.responses) ? announcement.responses : [];
  const found = responses.find(
    (r) => String(r.student) === String(userId)
  );

  return {
    ...announcement.toObject(),
    learnerResponse: found ? found.response : "pending",
    responses: undefined,
  };
}

// ============================================
// CREATE ANNOUNCEMENT
// admin / editor
// ============================================
router.post("/", protect, async (req, res) => {
  try {
    if (!isAdminOrEditor(req.user)) {
      return res.status(403).json({ message: "Not authorized." });
    }

    const {
      title,
      message,
      grade,
      category,
      isPublished,
      sendToStudents,
      urgentNotice,
      meetingLink,
      meetingDate,
      meetingTime,
      dueDate,
      quizStatus,
    } = req.body;

    if (!String(title || "").trim()) {
      return res.status(400).json({ message: "Title is required." });
    }

    if (!String(message || "").trim()) {
      return res.status(400).json({ message: "Message is required." });
    }

    const newAnnouncement = await Announcement.create({
      title: String(title).trim(),
      message: String(message).trim(),
      grade: normalizeGrade(grade),
      category: normalizeCategory(category),
      isPublished: typeof isPublished === "boolean" ? isPublished : true,
      sendToStudents: !!sendToStudents,
      urgentNotice: !!urgentNotice,
      meetingLink: String(meetingLink || "").trim(),
      meetingDate: String(meetingDate || "").trim(),
      meetingTime: String(meetingTime || "").trim(),
      dueDate: String(dueDate || "").trim(),
      quizStatus: String(quizStatus || "Open").trim(),
      createdBy: req.user._id,
    });

    return res.status(201).json({
      message: "Announcement created successfully.",
      announcement: newAnnouncement,
    });
  } catch (err) {
    console.error("CREATE ANNOUNCEMENT ERROR:", err);
    return res.status(500).json({ message: "Server error while creating announcement." });
  }
});

// ============================================
// GET ANNOUNCEMENTS FOR LEARNER / USER
// Learners see only their grade + allGrades
// Admin / editor see all
// ============================================
router.get("/", protect, async (req, res) => {
  try {
    const { q = "", grade = "", category = "" } = req.query;

    const isPrivileged = isAdminOrEditor(req.user);

    const filter = {};

    if (!isPrivileged) {
      const learnerGrade =
        req.user?.grade != null ? `grade${req.user.grade}` : null;

      filter.isPublished = true;

      if (learnerGrade) {
        filter.grade = { $in: [learnerGrade, "allGrades"] };
      } else {
        filter.grade = "allGrades";
      }
    } else {
      if (grade) filter.grade = normalizeGrade(grade);
      if (typeof req.query.isPublished !== "undefined") {
        filter.isPublished = String(req.query.isPublished) === "true";
      }
    }

    if (category) {
      const cat = normalizeCategory(category);
      if (cat !== "all") {
        filter.category = { $in: [cat, "all"] };
      }
    }

    if (String(q || "").trim()) {
      const rx = new RegExp(escapeRegex(String(q).trim()), "i");
      filter.$or = [{ title: rx }, { message: rx }];
    }

    const announcements = await Announcement.find(filter)
      .sort({ urgentNotice: -1, createdAt: -1 })
      .populate("createdBy", "username email role");

    const mapped = announcements.map((a) => mapLearnerResponse(a, req.user._id));

    const generalAnnouncements = mapped.filter(
      (a) => a.category === "general" || a.category === "all"
    );

    const classAnnouncements = mapped.filter(
      (a) => a.category === "class" || a.category === "all"
    );

    const quizAnnouncements = mapped.filter(
      (a) => a.category === "quiz" || a.category === "all"
    );

    const latestUrgent = mapped.find((a) => a.urgentNotice);

    res.json({
      updatedAt: mapped[0]?.updatedAt || null,
      urgentNotice: latestUrgent?.message || "",
      weeklyFocus: latestUrgent?.title || "",
      generalAnnouncements,
      classAnnouncements,
      quizAnnouncements,
      announcements: mapped, // useful for admin page table
    });
  } catch (err) {
    console.error("GET ANNOUNCEMENTS ERROR:", err);
    return res.status(500).json({ message: "Server error while loading announcements." });
  }
});

// ============================================
// GET ADMIN LIST
// ============================================
router.get("/admin/list", protect, async (req, res) => {
  try {
    if (!isAdminOrEditor(req.user)) {
      return res.status(403).json({ message: "Not authorized." });
    }

    const items = await Announcement.find({})
      .sort({ createdAt: -1 })
      .populate("createdBy", "username email");

    res.json(items);
  } catch (err) {
    console.error("ADMIN LIST ANNOUNCEMENTS ERROR:", err);
    return res.status(500).json({ message: "Server error while loading admin announcements." });
  }
});

// ============================================
// PROFILE SUMMARY
// ============================================
router.get("/profile-summary", protect, async (req, res) => {
  try {
    let gradeFilter = ["allGrades"];

    if (!isAdminOrEditor(req.user) && req.user?.grade != null) {
      gradeFilter = [`grade${req.user.grade}`, "allGrades"];
    }

    const latest = await Announcement.findOne({
      isPublished: true,
      grade: { $in: gradeFilter },
    }).sort({ createdAt: -1 });

    const count = await Announcement.countDocuments({
      isPublished: true,
      grade: { $in: gradeFilter },
    });

    res.json({
      count,
      latest: latest
        ? {
            _id: latest._id,
            title: latest.title,
            message: latest.message,
            category: latest.category,
            createdAt: latest.createdAt,
          }
        : null,
    });
  } catch (err) {
    console.error("PROFILE SUMMARY ANNOUNCEMENTS ERROR:", err);
    return res.status(500).json({ message: "Server error while loading announcement summary." });
  }
});

// ============================================
// UPDATE ANNOUNCEMENT
// admin / editor
// ============================================
router.put("/:id", protect, async (req, res) => {
  try {
    if (!isAdminOrEditor(req.user)) {
      return res.status(403).json({ message: "Not authorized." });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid announcement id." });
    }

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    const {
      title,
      message,
      grade,
      category,
      isPublished,
      sendToStudents,
      urgentNotice,
      meetingLink,
      meetingDate,
      meetingTime,
      dueDate,
      quizStatus,
    } = req.body;

    announcement.title = String(title ?? announcement.title).trim();
    announcement.message = String(message ?? announcement.message).trim();
    announcement.grade = normalizeGrade(grade ?? announcement.grade);
    announcement.category = normalizeCategory(category ?? announcement.category);

    if (typeof isPublished === "boolean") announcement.isPublished = isPublished;
    if (typeof sendToStudents === "boolean") announcement.sendToStudents = sendToStudents;
    if (typeof urgentNotice === "boolean") announcement.urgentNotice = urgentNotice;

    announcement.meetingLink = String(meetingLink ?? announcement.meetingLink ?? "").trim();
    announcement.meetingDate = String(meetingDate ?? announcement.meetingDate ?? "").trim();
    announcement.meetingTime = String(meetingTime ?? announcement.meetingTime ?? "").trim();
    announcement.dueDate = String(dueDate ?? announcement.dueDate ?? "").trim();
    announcement.quizStatus = String(quizStatus ?? announcement.quizStatus ?? "Open").trim();

    await announcement.save();

    return res.json({
      message: "Announcement updated successfully.",
      announcement,
    });
  } catch (err) {
    console.error("UPDATE ANNOUNCEMENT ERROR:", err);
    return res.status(500).json({ message: "Server error while updating announcement." });
  }
});

// ============================================
// DELETE ANNOUNCEMENT
// admin / editor
// ============================================
router.delete("/:id", protect, async (req, res) => {
  try {
    if (!isAdminOrEditor(req.user)) {
      return res.status(403).json({ message: "Not authorized." });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid announcement id." });
    }

    const deleted = await Announcement.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    return res.json({ message: "Announcement deleted successfully." });
  } catch (err) {
    console.error("DELETE ANNOUNCEMENT ERROR:", err);
    return res.status(500).json({ message: "Server error while deleting announcement." });
  }
});

// ============================================
// RESPOND TO CLASS ANNOUNCEMENT
// learners
// ============================================
router.post("/:id/respond", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { response } = req.body;

    if (!["accepted", "rejected"].includes(String(response || "").toLowerCase())) {
      return res.status(400).json({ message: "Response must be accepted or rejected." });
    }

    const announcement = await Announcement.findById(id);

    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    if (!["class", "all"].includes(announcement.category)) {
      return res.status(400).json({ message: "This announcement does not accept class responses." });
    }

    const existing = announcement.responses.find(
      (r) => String(r.student) === String(req.user._id)
    );

    if (existing) {
      existing.response = response.toLowerCase();
      existing.respondedAt = new Date();
    } else {
      announcement.responses.push({
        student: req.user._id,
        response: response.toLowerCase(),
        respondedAt: new Date(),
      });
    }

    await announcement.save();

    return res.json({
      message: "Response saved successfully.",
      learnerResponse: response.toLowerCase(),
    });
  } catch (err) {
    console.error("RESPOND ANNOUNCEMENT ERROR:", err);
    return res.status(500).json({ message: "Server error while saving response." });
  }
});

export default router;
