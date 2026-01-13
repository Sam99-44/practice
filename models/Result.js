// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import Quiz from "./models/Quiz.js";
import User from "./models/User.js";
import Result from "./models/Result.js";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import crypto from "crypto";
import { getTransporter } from "./utils/mailer.js";

dotenv.config();

const app = express();

/* ------------------ MIDDLEWARE ------------------ */

// If you ever get CORS issues, replace cors() with a stricter config.
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("Practice Online API running"));

/* ------------------ HELPERS ------------------ */

function smtpReady() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.APP_URL
  );
}

/* ------------------ AUTH MIDDLEWARE ------------------ */

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET missing in environment" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, username }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

async function adminOnly(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select("role username");
    if (!user) return res.status(401).json({ message: "User not found" });
    if (user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

/* ------------------ AUTH ROUTES ------------------ */

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, grade, password } = req.body;

    if (!username || !email || !grade || !password) {
      return res.status(400).json({ message: "Username, email, grade and password are required" });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const g = Number(grade);

    if (!Number.isFinite(g) || g < 8 || g > 12) {
      return res.status(400).json({ message: "Grade must be between 8 and 12" });
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
    if (!emailOk) return res.status(400).json({ message: "Invalid email address" });

    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be 6+ characters" });
    }

    const usernameExists = await User.findOne({ username: cleanUsername });
    if (usernameExists) return res.status(409).json({ message: "Username already taken" });

    const emailExists = await User.findOne({ email: cleanEmail });
    if (emailExists) return res.status(409).json({ message: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);

    await User.create({
      username: cleanUsername,
      email: cleanEmail,
      grade: g,
      passwordHash
    });

    // Welcome email (optional)
    try {
      if (!smtpReady()) {
        console.log("SMTP not configured - skipping welcome email");
      } else {
        const transporter = getTransporter();
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: cleanEmail,
          subject: "Welcome to Practice Online 🎉",
          text: `Hi ${cleanUsername},

Welcome to Practice Online!

You have successfully registered for Grade ${g} Mathematics.

Login here:
${process.env.APP_URL}/login.html

Good luck!

— Practice Online Team`
        });
      }
    } catch (mailErr) {
      console.error("Welcome email failed:", mailErr.message);
    }

    res.status(201).json({ message: "Account created" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const cleanUsername = (username || "").trim();
    const user = await User.findOne({ username: cleanUsername });
    if (!user) return res.status(401).json({ message: "Invalid login" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid login" });

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET missing in environment" });
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Current user
app.get("/api/auth/me", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("username role email grade createdAt");
    if (!user) return res.status(401).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ FORGOT PASSWORD ------------------ */

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();

    const genericMsg = { message: "If that email exists, a reset link was sent." };
    if (!cleanEmail) return res.json(genericMsg);

    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.json(genericMsg);

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    const resetLink = `${process.env.APP_URL}/reset-password.html?token=${token}&email=${encodeURIComponent(cleanEmail)}`;

    if (!smtpReady()) return res.json(genericMsg);

    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: cleanEmail,
      subject: "Practice Online - Reset your password",
      text: `Reset your password using this link (expires in 15 minutes):\n\n${resetLink}`
    });

    return res.json(genericMsg);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({ message: "Missing token, email or newPassword" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "Password must be 6+ characters" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      email: cleanEmail,
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired reset link" });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: "Password updated. Please login." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ QUIZ ROUTES ------------------ */

app.get("/api/quizzes", async (req, res) => {
  try {
    const grade = Number(req.query.grade);
    const filter = Number.isFinite(grade) ? { grade } : {};
    const quizzes = await Quiz.find(filter).sort({ createdAt: -1 });
    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/quizzes/:id", async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    res.json(quiz);
  } catch {
    res.status(400).json({ message: "Invalid quiz id" });
  }
});

app.post("/api/quizzes", authRequired, adminOnly, async (req, res) => {
  try {
    const quiz = await Quiz.create(req.body);
    res.status(201).json(quiz);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* ------------------ RESULTS ROUTES ------------------ */

// Check if current user already attempted quiz
app.get("/api/results/mine/:quizId", authRequired, async (req, res) => {
  try {
    const { quizId } = req.params;
    const existing = await Result.findOne({ userId: req.user.userId, quizId })
      .select("_id score total percent createdAt quizTitle grade topic");

    res.json({ attempted: Boolean(existing), result: existing || null });
  } catch (err) {
    res.status(400).json({ message: "Invalid quiz id" });
  }
});

// Save result (ONE attempt only)
app.post("/api/results", authRequired, async (req, res) => {
  try {
    const { quizId, quizTitle, grade, topic, score, total, answers } = req.body;

    if (!quizId) return res.status(400).json({ message: "quizId is required" });

    const s = Number(score);
    const t = Number(total);
    if (!Number.isFinite(s) || !Number.isFinite(t) || t <= 0) {
      return res.status(400).json({ message: "score and total must be numbers and total > 0" });
    }
    if (s < 0 || s > t) return res.status(400).json({ message: "Invalid score" });

    const percent = Math.round((s / t) * 100);

    const doc = await Result.create({
      userId: req.user.userId,
      username: req.user.username, // keep if your Result model includes it
      quizId,
      quizTitle: quizTitle || "",
      grade: grade ?? null,
      topic: topic || "",
      score: s,
      total: t,
      percent,
      answers: Array.isArray(answers) ? answers : []
    });

    res.status(201).json({ ok: true, resultId: doc._id });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "You already attempted this quiz." });
    }
    res.status(500).json({ message: err.message });
  }
});

// List my results
app.get("/api/results/mine", authRequired, async (req, res) => {
  try {
    const results = await Result.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ ADMIN DASHBOARD ROUTES ------------------ */

app.get("/api/admin/stats", authRequired, adminOnly, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalLearners = await User.countDocuments({ role: "learner" });
    const totalQuizzes = await Quiz.countDocuments();
    const totalResults = await Result.countDocuments();

    const quizzesByGradeAgg = await Quiz.aggregate([
      { $group: { _id: "$grade", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const learnersByGradeAgg = await User.aggregate([
      { $match: { role: "learner" } },
      { $group: { _id: "$grade", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      totalUsers,
      totalLearners,
      totalQuizzes,
      totalResults,
      quizzesByGrade: quizzesByGradeAgg.map((x) => ({ grade: x._id, count: x.count })),
      learnersByGrade: learnersByGradeAgg.map((x) => ({ grade: x._id, count: x.count }))
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ DATABASE CONNECTION ------------------ */

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  })
  .catch((err) => console.error("Mongo error:", err.message));
