import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "..", "uploads", "profile");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `user-${req.user.id}-${Date.now()}${safeExt}`);
  },
});

function fileFilter(req, file, cb) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only JPG, PNG, and WEBP images are allowed."));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 },
});

function toPublicUser(user) {
  return {
    id: user._id,
    fullName: user.fullName || "",
    username: user.username || "",
    email: user.email || "",
    grade: user.grade ?? "",
    accountType: user.accountType || "",
    role: user.role || "",
    learnerNumber: user.learnerNumber || "",
    profileHeadline: user.profileHeadline || "",
    profilePhoto: user.profilePhoto || "",
    joinedYear: user.createdAt ? new Date(user.createdAt).getFullYear() : "",
  };
}

// GET current profile
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "fullName username email grade accountType role learnerNumber profileHeadline profilePhoto createdAt"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(toPublicUser(user));
  } catch (error) {
    console.error("GET /api/profile/me error:", error);
    return res.status(500).json({ message: "Failed to load profile" });
  }
});

// PATCH current profile
router.patch("/me", requireAuth, async (req, res) => {
  try {
    const { fullName, username, email, grade, profileHeadline } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (typeof fullName === "string") {
      user.fullName = fullName.trim();
    }

    if (typeof username === "string") {
      const newUsername = username.trim();
      if (!newUsername) {
        return res.status(400).json({ message: "Username is required." });
      }

      const existingUsername = await User.findOne({
        _id: { $ne: user._id },
        username: newUsername,
      });

      if (existingUsername) {
        return res.status(400).json({ message: "Username already in use." });
      }

      user.username = newUsername;
    }

    if (typeof email === "string") {
      const newEmail = email.trim().toLowerCase();

      if (!newEmail) {
        return res.status(400).json({ message: "Email is required." });
      }

      const existingEmail = await User.findOne({
        _id: { $ne: user._id },
        email: newEmail,
      });

      if (existingEmail) {
        return res.status(400).json({ message: "Email already in use." });
      }

      user.email = newEmail;
    }

    if (typeof profileHeadline === "string") {
      user.profileHeadline = profileHeadline.trim();
    }

    if (grade !== undefined && user.accountType === "student") {
      const parsedGrade = Number(grade);
      if (Number.isNaN(parsedGrade) || parsedGrade < 1 || parsedGrade > 12) {
        return res.status(400).json({ message: "Grade must be between 1 and 12." });
      }
      user.grade = parsedGrade;
    }

    await user.save();

    return res.json({
      message: "Profile updated successfully.",
      user: toPublicUser(user),
    });
  } catch (error) {
    console.error("PATCH /api/profile/me error:", error);
    return res.status(500).json({ message: "Failed to update profile" });
  }
});

// POST upload profile photo
router.post("/me/photo", requireAuth, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded." });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // remove old local photo file if it exists
    if (user.profilePhoto && user.profilePhoto.startsWith("/uploads/profile/")) {
      const oldPath = path.join(__dirname, "..", user.profilePhoto);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    user.profilePhoto = `/uploads/profile/${req.file.filename}`;
    await user.save();

    return res.json({
      message: "Profile photo uploaded successfully.",
      profilePhoto: user.profilePhoto,
    });
  } catch (error) {
    console.error("POST /api/profile/me/photo error:", error);
    return res.status(500).json({ message: "Failed to upload profile photo" });
  }
});

// DELETE remove profile photo
router.delete("/me/photo", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.profilePhoto && user.profilePhoto.startsWith("/uploads/profile/")) {
      const oldPath = path.join(__dirname, "..", user.profilePhoto);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    user.profilePhoto = "";
    await user.save();

    return res.json({ message: "Profile photo removed successfully." });
  } catch (error) {
    console.error("DELETE /api/profile/me/photo error:", error);
    return res.status(500).json({ message: "Failed to remove profile photo" });
  }
});

export default router;