// server.js (COPY & PASTE FULL UPDATED)
// ✅ Adds: 8-digit Student Number when accountType = "student"
// ✅ Adds: POST /api/login
// ✅ Keeps: /api/register + SendGrid welcome email + test-email + health

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import sgMail from "@sendgrid/mail";

import Quiz from "./models/Quiz.js";
import User from "./models/User.js";
import Result from "./models/Result.js";

dotenv.config();

const app = express();
app.use(express.json());

/* ------------------ SENDGRID ------------------ */
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const FROM_EMAIL = (process.env.FROM_EMAIL || "").trim(); // verified in SendGrid
const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");

if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY);

async function sendEmail({ to, subject, html, text }) {
  if (!SENDGRID_API_KEY) throw new Error("Missing SENDGRID_API_KEY on server");
  if (!FROM_EMAIL) throw new Error("Missing FROM_EMAIL on server");

  try {
    await sgMail.send({
      to,
      from: FROM_EMAIL,
      subject,
      text: text || undefined,
      html: html || undefined,
    });
  } catch (err) {
    const detail =
      err?.response?.body?.errors?.map((e) => e.message).join(" | ") ||
      err?.message ||
      "Unknown SendGrid error";
    console.error("SendGrid send failed:", detail);
    throw new Error(detail);
  }
}

/* ------------------ HELPERS ------------------ */
function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}
function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

// ✅ Generate a unique 8-digit student number (only digits)
async function generateStudentNumber8() {
  while (true) {
    const num = String(Math.floor(10000000 + Math.random() * 90000000)); // 8 digits
    const exists = await User.findOne({ studentNumber: num }).select("_id");
    if (!exists) return num;
  }
}

/* ------------------ CORS ------------------ */
const ALLOWED_ORIGINS = [
  process.env.APP_URL,
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      if (origin.endsWith(".netlify.app")) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: true,
  })
);

app.options("*", cors());

/* ------------------ HEALTH ------------------ */
app.get("/", (req, res) => res.send("Practice Online API running"));
app.get("/api/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

/* ------------------ TEST EMAIL (TEMP) ------------------ */
// Use: https://practice-backend-msgn.onrender.com/test-email?to=you@gmail.com
app.get("/test-email", async (req, res) => {
  const to = (req.query.to || "practiceallonline@gmail.com").trim();

  try {
    await sendEmail({
      to,
      subject: "SendGrid test ✅",
      text: "Email sending works 🚀",
      html: "<strong>Email sending works 🚀</strong>",
    });
    res.send("Email sent successfully to " + to);
  } catch (err) {
    console.error("Test email failed:", err.message);
    res.status(500).send("Email failed: " + err.message);
  }
});

/* ------------------ AUTH MIDDLEWARE ------------------ */
function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

async function adminOnly(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select("role");
    if (!user) return res.status(401).json({ message: "User not found" });
    if (user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

/* ------------------ AUTH ROUTES ------------------ */

// ✅ REGISTER (updated: accountType + studentNumber (8 digits))
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, grade, password, accountType } = req.body;

    if (!username || !email || !password || !accountType) {
      return res.status(400).json({ message: "Username, email, password, and account type are required." });
    }

    if (!["student", "materials"].includes(accountType)) {
      return res.status(400).json({ message: "Invalid account type." });
    }

    // grade required only for student
    let gradeNum = null;
    if (accountType === "student") {
      if (grade === undefined || grade === null || grade === "") {
        return res.status(400).json({ message: "Grade is required for Student accounts." });
      }
      gradeNum = Number(grade);
      if (!Number.isInteger(gradeNum) || gradeNum < 8 || gradeNum > 12) {
        return res.status(400).json({ message: "Grade must be between 8 and 12." });
      }
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const cleanUsername = String(username).trim();
    const cleanEmail = String(email).toLowerCase().trim();

    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) return res.status(409).json({ message: "Email already registered." });

    const existingUsername = await User.findOne({ username: cleanUsername });
    if (existingUsername) return res.status(409).json({ message: "Username already taken." });

    const passwordHash = await bcrypt.hash(password, 10);

    // ✅ only digits (8)
    const studentNumber =
      accountType === "student" ? await generateStudentNumber8() : null;

    const user = await User.create({
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      role: "learner",

      // ✅ new fields (must exist in User model)
      accountType,
      studentNumber,

      grade: gradeNum,

      emailVerified: true,
      verifyTokenHash: null,
      verifyTokenExpiresAt: null,
    });

    const extraHtml =
      user.accountType === "student"
        ? `<p><strong>Your Student Number:</strong> ${user.studentNumber}</p>`
        : `<p>You registered for <strong>Access Materials Only</strong>.</p>`;

    await sendEmail({
      to: user.email,
      subject: `Welcome ${user.username} 🎓`,
      text:
        user.accountType === "student"
          ? `Welcome ${user.username}! Your Student Number is ${user.studentNumber}.`
          : `Welcome ${user.username}! You registered for Access Materials Only.`,
      html: `
        <h2>Welcome ${user.username} 🎓</h2>
        <p>Your account has been successfully created.</p>
        ${extraHtml}
        <p>Regards,<br/>Practice Online Team</p>
      `,
    });

    return res.status(201).json({
      message: "Account created ✅ Welcome email sent ✅",
      accountType: user.accountType,
      studentNumber: user.studentNumber, // null for materials
    });
  } catch (err) {
    console.error("Register error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
});

// ✅ LOGIN (new)
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      message: "Login successful ✅",
      token,
      user: {
        username: user.username,
        email: user.email,
        role: user.role,
        accountType: user.accountType,
        studentNumber: user.studentNumber,
        grade: user.grade,
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
});

/* ------------------ DB + START ------------------ */
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server running on ${PORT}`));
  })
  .catch((err) => console.error("Mongo error:", err.message));
