// server.js (PRODUCTION - COPY & PASTE)
// ✅ Uses mailer.js directly
// ❌ NO testMail.js (removed)
// ✅ Register, login, OTP reset
// ✅ Admin quiz upload + email learners by grade

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

app.options("*", cors());

/* ------------------- DEBUG ------------------- */
console.log("MONGO_URI:", process.env.MONGO_URI ? "LOADED ✅" : "MISSING ❌");
console.log("SMTP_HOST:", process.env.SMTP_HOST ? "LOADED ✅" : "MISSING ❌");
console.log("SMTP_USER:", process.env.SMTP_USER ? "LOADED ✅" : "MISSING ❌");
console.log("MAIL_FROM_EMAIL:", process.env.MAIL_FROM_EMAIL ? "LOADED ✅" : "MISSING ❌");

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

/* ------------------- QUIZ EMAIL TEMPLATE ------------------- */
function quizUploadedHtml({ quizTitle, quizTopic, grade }) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>New Quiz Uploaded ✅</h2>
      <p><b>Grade:</b> ${grade}</p>
      <p><b>Topic:</b> ${quizTopic}</p>
      <p><b>Title:</b> ${quizTitle}</p>
      <p>Please login to Practice Online to attempt it.</p>
      <p style="color:#64748b">Practice Online</p>
    </div>
  `;
}

async function notifyGradeLearners(grade, quiz) {
  const learners = await User.find({
    role: "learner",
    grade: Number(grade),
    email: { $exists: true, $ne: "" },
  }).select("email");

  const emails = learners.map((u) => u.email);
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

    results.forEach((r) => (r.status === "fulfilled" ? sent++ : failed++));
  }

  return { total: emails.length, sent, failed };
}

/* ------------------- AUTH ------------------- */
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
  const u = await User.findById(req.user.userId).select("role");
  if (!u || u.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
}

/* ------------------- ROUTES ------------------- */
app.get("/", (req, res) => res.send("Practice Online API running"));

/* -------- REGISTER -------- */
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password, grade } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ message: "Missing fields" });

    const cleanEmail = String(email).toLowerCase().trim();
    if (await User.findOne({ email: cleanEmail }))
      return res.status(409).json({ message: "Email exists" });

    const user = await User.create({
      username: cleanSpaces(username),
      email: cleanEmail,
      passwordHash: await bcrypt.hash(password, 10),
      grade: grade ? Number(grade) : null,
      role: "learner",
    });

    await sendEmail({
      to: user.email,
      subject: "Welcome to Practice Online",
      html: `<h2>Welcome ${user.username}</h2><p>Your account is ready.</p>`,
    });

    res.status(201).json({ message: "Registered successfully" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- LOGIN -------- */
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ message: "Invalid login" });

  const token = jwt.sign(
    { userId: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token, user });
});

/* -------- FORGOT PASSWORD (OTP) -------- */
app.post("/api/forgot-password-otp", async (req, res) => {
  const cleanEmail = String(req.body.email || "").toLowerCase().trim();
  const user = await User.findOne({ email: cleanEmail });
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
});

/* -------- RESET PASSWORD -------- */
app.post("/api/reset-password-otp", async (req, res) => {
  const { email, code, newPassword } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });

  if (
    !user ||
    user.resetPasswordTokenHash !== hashToken(code) ||
    user.resetPasswordExpires < Date.now()
  ) {
    return res.status(400).json({ message: "Invalid or expired code" });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpires = null;
  await user.save();

  res.json({ message: "Password updated" });
});

/* -------- ADMIN QUIZ UPLOAD -------- */
app.post("/api/quizzes", authRequired, adminOnly, async (req, res) => {
  const { grade, title, topic, questions } = req.body;
  if (!grade || !title || !topic || !questions?.length)
    return res.status(400).json({ message: "Invalid quiz data" });

  const quiz = await Quiz.create({
    grade: Number(grade),
    title: cleanSpaces(title),
    topic: cleanSpaces(topic),
    questions,
  });

  const report = await notifyGradeLearners(grade, quiz);

  res.status(201).json({
    message: "Quiz uploaded",
    quizId: quiz._id,
    emailReport: report,
  });
});

/* ------------------- START ------------------- */
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected ✅");
    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    );
  })
  .catch((err) => console.error("Mongo error:", err.message));
