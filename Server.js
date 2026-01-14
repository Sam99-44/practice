// Server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import Quiz from "./models/Quiz.js";
import User from "./models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import crypto from "crypto";
import { getTransporter, verifySmtp } from "./utils/mailer.js";

dotenv.config();

const app = express();

/* ------------------ CORS ------------------ */
// Allow your Netlify site + localhost (for testing)
const ALLOWED_ORIGINS = [
  process.env.APP_URL,                  // https://practiceonline.netlify.app
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // allow server-to-server calls or curl (no origin)
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true
  })
);

app.use(express.json());

/* ------------------ HEALTH ------------------ */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

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

// Register + welcome email
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

    if (password.length < 6) {
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

    // Welcome email (don’t fail registration if email fails)
    if (smtpReady()) {
      try {
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

— Practice Online Team`
        });
      } catch (mailErr) {
        console.error("Welcome email failed:", mailErr?.message || mailErr);
      }
    } else {
      console.log("SMTP not configured - skipping welcome email");
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
      return res.status(500).json({ message: "JWT_SECRET missing in env" });
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

// Forgot password
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

    if (!smtpReady()) {
      console.log("SMTP not configured - skipping reset email");
      return res.json(genericMsg);
    }

    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: cleanEmail,
        subject: "Practice Online - Reset your password",
        text: `Reset your password (expires in 15 minutes):\n\n${resetLink}`
      });
    } catch (mailErr) {
      console.error("Reset email failed:", mailErr?.message || mailErr);
      // still return generic message
    }

    return res.json(genericMsg);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Reset password
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({ message: "Missing token, email or newPassword" });
    }
    if (newPassword.length < 6) {
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

/* ------------------ ADMIN ------------------ */

app.get("/api/admin/test-email", authRequired, adminOnly, async (req, res) => {
  try {
    if (!smtpReady()) {
      return res.status(400).json({
        message: "SMTP not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and APP_URL"
      });
    }

    const to = (req.query.to || "").trim();
    if (!to) return res.status(400).json({ message: "Use ?to=your@email.com" });

    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject: "Practice Online - Test Email ✅",
      text: "If you received this email, SMTP is working correctly."
    });

    res.json({ message: "Test email sent ✅" });
  } catch (err) {
    // This will show the REAL reason (timeout, auth fail, etc.)
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ DATABASE + START ------------------ */

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");

    // Optional: verify SMTP on startup (helps you see errors in Render logs)
    if (smtpReady()) {
      try {
        await verifySmtp();
        console.log("SMTP verified ✅");
      } catch (e) {
        console.error("SMTP verify failed ❌:", e?.message || e);
      }
    } else {
      console.log("SMTP not configured (missing vars) - emails disabled");
    }

    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  })
  .catch((err) => console.error("Mongo error:", err.message));
