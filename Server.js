// server.js (UPDATED - COPY & PASTE)
// ✅ Uses your existing /api/test-email route (mounted)
// ✅ Adds: admin quiz upload + email all learners in that grade
// ✅ Keeps: register, login, forgot/reset OTP, CORS, Mongo connect

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import User from "./models/User.js";
import Quiz from "./models/Quiz.js";
import Result from "./models/Result.js";

import testMailRouter from "./routes/testMail.js";
import { getTransporter } from "./utils/mailer.js";

dotenv.config();

const app = express();
app.use(express.json());

/* ------------------- CORS ------------------- */
const ALLOWED = [
  process.env.APP_URL,
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED.includes(origin)) return cb(null, true);
      if (String(origin).endsWith(".netlify.app")) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin), false);
    },
  })
);

// Preflight
app.options("*", cors());

/* ------------------- DEBUG ------------------- */
console.log("MONGO_URI:", process.env.MONGO_URI ? "LOADED ✅" : "MISSING ❌");
console.log("SMTP_HOST:", process.env.SMTP_HOST ? "LOADED ✅" : "MISSING ❌");
console.log("SMTP_USER:", process.env.SMTP_USER ? "LOADED ✅" : "MISSING ❌");
console.log(
  "MAIL_FROM_EMAIL:",
  process.env.MAIL_FROM_EMAIL ? "LOADED ✅" : "MISSING ❌"
);

/* ------------------- EMAIL HELPER ------------------- */
async function sendEmail({ to, subject, html }) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_EMAIL}>`,
    to,
    subject,
    html,
  });
}

/* ------------------- HELPERS ------------------- */
function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function cleanSpaces(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Sends quiz upload email to one person
function quizUploadedHtml({ quizTitle, quizTopic, grade }) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2 style="margin:0 0 10px">New Quiz Uploaded ✅</h2>
      <p style="margin:0 0 8px">A new quiz is now available on Practice Online.</p>
      <p style="margin:0 0 6px"><b>Grade:</b> ${grade}</p>
      <p style="margin:0 0 6px"><b>Topic:</b> ${quizTopic}</p>
      <p style="margin:0 0 14px"><b>Title:</b> ${quizTitle}</p>
      <p style="margin:0 0 14px">
        Login to Practice Online to attempt it.
      </p>
      <p style="color:#64748b;margin:0">Practice Online</p>
    </div>
  `;
}

// Notify all learners in that grade (batch to avoid SMTP limits)
async function notifyGradeLearners(grade, quiz) {
  const learners = await User.find({
    role: "learner",
    grade: Number(grade),
    email: { $exists: true, $ne: "" },
  }).select("email");

  const emails = learners.map((u) => u.email).filter(Boolean);
  const batches = chunkArray(emails, 10);

  let sent = 0;
  let failed = 0;

  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map((to) =>
        sendEmail({
          to,
          subject: `New Quiz Uploaded (Grade ${grade})`,
          html: quizUploadedHtml({
            quizTitle: quiz.title,
            quizTopic: quiz.topic,
            grade,
          }),
        })
      )
    );

    for (const r of results) {
      if (r.status === "fulfilled") sent++;
      else failed++;
    }
  }

  return { total: emails.length, sent, failed };
}

/* ------------------- AUTH MIDDLEWARE ------------------- */
function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

async function adminOnly(req, res, next) {
  try {
    const u = await User.findById(req.user.userId).select("role");
    if (!u) return res.status(401).json({ message: "User not found" });
    if (u.role !== "admin") return res.status(403).json({ message: "Admin only" });
    next();
  } catch {
    res.status(500).json({ message: "Server error" });
  }
}

/* ------------------- ROUTES ------------------- */
app.get("/", (req, res) => res.send("Practice Online API running"));

/* ✅ Mount test mail route => /api/test-email */
app.use("/api", testMailRouter);

/* -------- REGISTER -------- */
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password, grade } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ message: "Missing fields" });

    const cleanEmail = String(email).toLowerCase().trim();
    const exists = await User.findOne({ email: cleanEmail });
    if (exists) return res.status(409).json({ message: "Email exists" });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username: cleanSpaces(username),
      email: cleanEmail,
      passwordHash,
      grade: grade ? Number(grade) : null,
      role: "learner",
    });

    // send welcome email (optional)
    try {
      await sendEmail({
        to: user.email,
        subject: "Welcome to Practice Online",
        html: `<h2>Welcome ${user.username}</h2><p>Your account is ready.</p>`,
      });
    } catch (e) {
      console.error("WELCOME EMAIL FAILED:", e?.message || e);
    }

    res.status(201).json({ message: "Registered successfully" });
  } catch (e) {
    console.error("REGISTER ERROR:", e?.message || e);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- LOGIN -------- */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const cleanEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(401).json({ message: "Invalid login" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid login" });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user });
  } catch (e) {
    console.error("LOGIN ERROR:", e?.message || e);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- FORGOT PASSWORD (OTP) -------- */
app.post("/api/forgot-password-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = String(email || "").toLowerCase().trim();
    if (!cleanEmail) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: cleanEmail });

    // don’t reveal if it exists
    if (!user) return res.json({ message: "If email exists, code sent" });

    const otp = generateOtp();
    user.resetPasswordTokenHash = hashToken(otp);
    user.resetPasswordExpires = new Date(Date.now() + 10 * 60000);
    await user.save();

    await sendEmail({
      to: cleanEmail,
      subject: "Password Reset Code",
      html: `<h2>Your code: ${otp}</h2><p>Expires in 10 minutes.</p>`,
    });

    res.json({ message: "If email exists, code sent" });
  } catch (e) {
    console.error("FORGOT OTP ERROR:", e?.message || e);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- RESET PASSWORD (OTP) -------- */
app.post("/api/reset-password-otp", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    const cleanEmail = String(email || "").toLowerCase().trim();
    const cleanCode = String(code || "").trim();

    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(400).json({ message: "Invalid code" });

    const expired =
      !user.resetPasswordExpires || user.resetPasswordExpires.getTime() < Date.now();
    const match = user.resetPasswordTokenHash === hashToken(cleanCode);

    if (!match || expired) return res.status(400).json({ message: "Invalid or expired code" });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: "Password updated" });
  } catch (e) {
    console.error("RESET OTP ERROR:", e?.message || e);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- QUIZZES (ADMIN UPLOAD + EMAIL GRADE) --------
   POST /api/quizzes?notify=1 (default notify ON)
*/
app.post("/api/quizzes", authRequired, adminOnly, async (req, res) => {
  try {
    const { grade, title, topic, timeLimitMinutes, questions } = req.body;

    if (!grade || !title || !topic || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: "Grade, topic, title, and questions are required." });
    }

    const g = Number(grade);
    if (!Number.isInteger(g) || g < 8 || g > 12) {
      return res.status(400).json({ message: "Grade must be between 8 and 12." });
    }

    const quiz = await Quiz.create({
      grade: g,
      title: cleanSpaces(title),
      topic: cleanSpaces(topic),
      timeLimitMinutes: Number(timeLimitMinutes) || 0,
      questions,
    });

    const notify = String(req.query.notify || "1") === "1";
    let report = null;

    if (notify) {
      report = await notifyGradeLearners(g, { title: quiz.title, topic: quiz.topic });
    }

    return res.status(201).json({
      message: "Quiz uploaded successfully",
      quizId: quiz._id,
      emailNotification: notify ? report : "Skipped (notify=0)",
    });
  } catch (e) {
    console.error("QUIZ UPLOAD ERROR:", e?.message || e);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------- OPTIONAL 404 FOR API ------------------- */
app.use("/api", (req, res) => {
  res.status(404).json({ message: "API route not found" });
});

/* ------------------- ERROR HANDLER (CORS ETC.) ------------------- */
app.use((err, req, res, next) => {
  if (String(err?.message || "").startsWith("CORS blocked:")) {
    return res.status(403).json({ message: err.message });
  }
  console.error("Unhandled error:", err?.message || err);
  res.status(500).json({ message: "Server error" });
});

/* ------------------- START ------------------- */
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected ✅");
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Test email: http://localhost:${PORT}/api/test-email`);
    });
  })
  .catch((err) => console.error("Mongo error:", err.message));
