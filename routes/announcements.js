// routes/announcements.js
import express from "express";
import mongoose from "mongoose";
import Announcement from "../models/Announcement.js";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

const BREVO_API_KEY = (process.env.BREVO_API_KEY || "").trim();
const BREVO_SENDER_EMAIL = (process.env.BREVO_SENDER_EMAIL || "").trim();
const BREVO_SENDER_NAME = (process.env.BREVO_SENDER_NAME || "Practice Online").trim();

function isAdminOrEditor(user) {
  return user && (user.role === "admin" || user.role === "editor" || user.role === "tester");
}

function getUserId(user) {
  return user?._id || user?.userId || user?.id;
}

function normalizeGrade(value = "") {
  const v = String(value || "").trim();
  const allowed = ["grade8", "grade9", "grade10", "grade11", "grade12", "allGrades"];
  return allowed.includes(v) ? v : "allGrades";
}

function normalizeCategory(value = "") {
  const v = String(value || "").trim().toLowerCase();
  const allowed = ["general", "class", "quiz", "all"];
  return allowed.includes(v) ? v : "general";
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function announcementGradeToNumber(grade) {
  const match = String(grade || "").match(/^grade(\d+)$/);
  return match ? Number(match[1]) : null;
}

function mapLearnerResponse(announcement, userId) {
  const obj = announcement.toObject();
  const responses = Array.isArray(obj.responses) ? obj.responses : [];

  const found = responses.find((r) => String(r.student) === String(userId));

  obj.learnerResponse = found ? found.response : "pending";
  delete obj.responses;

  return obj;
}

async function sendBulkEmail({ recipients, subject, html, text }) {
  if (!BREVO_API_KEY) throw new Error("Missing BREVO_API_KEY");
  if (!BREVO_SENDER_EMAIL) throw new Error("Missing BREVO_SENDER_EMAIL");

  const cleanRecipients = recipients
    .map((email) => String(email || "").trim().toLowerCase())
    .filter(Boolean)
    .map((email) => ({ email }));

  if (!cleanRecipients.length) return { sent: 0 };

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: BREVO_SENDER_EMAIL,
        name: BREVO_SENDER_NAME,
      },
      to: cleanRecipients,
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Brevo announcement email error:", data);
    throw new Error("Announcement saved, but email sending failed.");
  }

  return { sent: cleanRecipients.length, data };
}

async function sendAnnouncementToStudents(announcement) {
  const filter = {
    role: "learner",
    accountType: "student",
    emailVerified: true,
    email: { $exists: true, $ne: "" },
  };

  if (announcement.grade !== "allGrades") {
    const gradeNumber = announcementGradeToNumber(announcement.grade);
    if (gradeNumber) filter.grade = gradeNumber;
  }

  const learners = await User.find(filter).select("email");
  const emails = learners.map((u) => u.email).filter(Boolean);

  if (!emails.length) return { sent: 0 };

  const extraDetails = [];

  if (announcement.category === "class" || announcement.category === "all") {
    if (announcement.meetingDate) extraDetails.push(`Date: ${announcement.meetingDate}`);
    if (announcement.meetingTime) extraDetails.push(`Time: ${announcement.meetingTime}`);
    if (announcement.meetingLink) extraDetails.push(`Meeting Link: ${announcement.meetingLink}`);
  }

  if (announcement.category === "quiz" || announcement.category === "all") {
    if (announcement.dueDate) extraDetails.push(`Due Date: ${announcement.dueDate}`);
    if (announcement.quizStatus) extraDetails.push(`Quiz Status: ${announcement.quizStatus}`);
  }

  const htmlDetails = extraDetails.length
    ? `<hr><p>${extraDetails.join("<br>")}</p>`
    : "";

  const textDetails = extraDetails.length
    ? `\n\n${extraDetails.join("\n")}`
    : "";

  return await sendBulkEmail({
    recipients: emails,
    subject: announcement.title,
    text: `${announcement.message}${textDetails}\n\nRegards,\nPractice Online`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">
        <h2>${announcement.title}</h2>
        <p>${String(announcement.message).replace(/\n/g, "<br>")}</p>
        ${htmlDetails}
        <p>Regards,<br>Practice Online</p>
      </div>
    `,
  });
}

// CREATE ANNOUNCEMENT
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
      createdBy: getUserId(req.user),
    });

    let emailResult = { sent: 0 };

    if (newAnnouncement.sendToStudents) {
      try {
        emailResult = await sendAnnouncementToStudents(newAnnouncement);
      } catch (emailErr) {
        console.error("Announcement email failed:", emailErr.message);

        return res.status(201).json({
          message: "Announcement created, but email sending failed.",
          emailError: emailErr.message,
          announcement: newAnnouncement,
        });
      }
    }

    return res.status(201).json({
      message: "Announcement created successfully.",
      emailsSent: emailResult.sent,
      announcement: newAnnouncement,
    });
  } catch (err) {
    console.error("CREATE ANNOUNCEMENT ERROR:", err);
    return res.status(500).json({ message: "Server error while creating announcement." });
  }
});

// GET ANNOUNCEMENTS
router.get("/", protect, async (req, res) => {
  try {
    const { q = "", grade = "", category = "" } = req.query;

    const isPrivileged = isAdminOrEditor(req.user);
    const filter = {};

    if (!isPrivileged) {
      const learnerGrade = req.user?.grade != null ? `grade${req.user.grade}` : null;

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

    const userId = getUserId(req.user);
    const mapped = announcements.map((a) => mapLearnerResponse(a, userId));

    res.json({
      updatedAt: mapped[0]?.updatedAt || null,
      urgentNotice: mapped.find((a) => a.urgentNotice)?.message || "",
      weeklyFocus: mapped.find((a) => a.urgentNotice)?.title || "",
      generalAnnouncements: mapped.filter((a) => a.category === "general" || a.category === "all"),
      classAnnouncements: mapped.filter((a) => a.category === "class" || a.category === "all"),
      quizAnnouncements: mapped.filter((a) => a.category === "quiz" || a.category === "all"),
      announcements: mapped,
    });
  } catch (err) {
    console.error("GET ANNOUNCEMENTS ERROR:", err);
    return res.status(500).json({ message: "Server error while loading announcements." });
  }
});

// ADMIN LIST
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

// PROFILE SUMMARY
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

// UPDATE ANNOUNCEMENT
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

// DELETE ANNOUNCEMENT
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

// RESPOND TO CLASS ANNOUNCEMENT
router.post("/:id/respond", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { response } = req.body;

    const cleanResponse = String(response || "").toLowerCase();

    if (!["accepted", "rejected"].includes(cleanResponse)) {
      return res.status(400).json({ message: "Response must be accepted or rejected." });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid announcement id." });
    }

    const announcement = await Announcement.findById(id);

    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    if (!["class", "all"].includes(announcement.category)) {
      return res.status(400).json({ message: "This announcement does not accept class responses." });
    }

    const userId = getUserId(req.user);

    const existing = announcement.responses.find(
      (r) => String(r.student) === String(userId)
    );

    if (existing) {
      existing.response = cleanResponse;
      existing.respondedAt = new Date();
    } else {
      announcement.responses.push({
        student: userId,
        response: cleanResponse,
        respondedAt: new Date(),
      });
    }

    await announcement.save();

    return res.json({
      message: "Response saved successfully.",
      learnerResponse: cleanResponse,
    });
  } catch (err) {
    console.error("RESPOND ANNOUNCEMENT ERROR:", err);
    return res.status(500).json({ message: "Server error while saving response." });
  }
});

export default router;
