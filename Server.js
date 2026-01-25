// server.js (FULL UPDATED - COPY & PASTE)
// ✅ Student register: accountType + 8-digit studentNumber
// ✅ Login: /api/login
// ✅ Profile: GET /api/auth/me
// ✅ Quizzes: GET /api/quizzes (learner grade), POST /api/quizzes (admin)
// ✅ Quiz by id: GET /api/quizzes/:id
// ✅ Results: POST /api/results, GET /api/results/my, GET /api/results/:id
// ✅ Password reset (OTP): /api/forgot-password-otp + /api/reset-password-otp
// ✅ SendGrid: welcome email + test-email + health

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
const FROM_EMAIL = (process.env.FROM_EMAIL || "").trim();

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
function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

// Generate unique 8-digit student number (digits only)
async function generateStudentNumber8() {
  while (true) {
    const num = String(Math.floor(10000000 + Math.random() * 90000000)); // 8 digits
    const exists = await User.findOne({ studentNumber: num }).select("_id");
    if (!exists) return num;
  }
}

// Generate 6-digit OTP
function makeOtp6() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function cleanSpaces(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

/* ------------------ CORS ------------------ */
const ALLOWED_ORIGINS = [
  process.env.APP_URL, // your Netlify URL (optional)
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

/* ------------------ TEST EMAIL ------------------ */
app.get("/test-email", async (req, res) => {
  const to = (req.query.to || "practiceallonline@gmail.com").trim();
  try {
    await sendEmail({
      to,
      subject: "SendGrid test",
      text: "Email sending works.",
      html: "<strong>Email sending works.</strong>",
    });
    res.send("Email sent successfully to " + to);
  } catch (err) {
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
    req.user = decoded; // { userId, role }
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
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
}

/* ------------------ AUTH ROUTES ------------------ */

// Profile endpoint used by learner-quizzes.html + admin pages
app.get("/api/auth/me", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "username email role grade accountType studentNumber"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      username: user.username,
      email: user.email,
      role: user.role,
      grade: user.grade,
      accountType: user.accountType,
      studentNumber: user.studentNumber,
    });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, grade, password, accountType } = req.body;

    if (!username || !email || !password || !accountType) {
      return res.status(400).json({
        message: "Username, email, password, and account type are required.",
      });
    }

    if (!["student", "materials"].includes(accountType)) {
      return res.status(400).json({ message: "Invalid account type." });
    }

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

    const cleanUsername = cleanSpaces(username);
    const cleanEmail = String(email).toLowerCase().trim();

    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) return res.status(409).json({ message: "Email already registered." });

    const existingUsername = await User.findOne({ username: cleanUsername });
    if (existingUsername) return res.status(409).json({ message: "Username already taken." });

    const passwordHash = await bcrypt.hash(password, 10);

    const studentNumber =
      accountType === "student" ? await generateStudentNumber8() : null;

    const user = await User.create({
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      role: "learner",
      accountType,
      studentNumber,
      grade: gradeNum,
      emailVerified: true,
      verifyTokenHash: null,
      verifyTokenExpiresAt: null,
    });

    if (user.accountType === "student") {
      await sendEmail({
        to: user.email,
        subject: `Welcome ${user.username}`,
        text: `Welcome ${user.username}, your student number is ${user.studentNumber}.`,
        html: `
          <h2>Welcome ${user.username}</h2>
          <p>Your student number is <strong>${user.studentNumber}</strong>.</p>
          <p>Regards,<br/>Practice Online Team</p>
        `,
      });
    } else {
      await sendEmail({
        to: user.email,
        subject: `Welcome ${user.username}`,
        text: `Welcome ${user.username}. You registered for Access Materials Only.`,
        html: `
          <h2>Welcome ${user.username}</h2>
          <p>You registered for <strong>Access Materials Only</strong>.</p>
          <p>Regards,<br/>Practice Online Team</p>
        `,
      });
    }

    return res.status(201).json({
      message: "Account created. Welcome email sent.",
      accountType: user.accountType,
      studentNumber: user.studentNumber,
    });
  } catch (err) {
    console.error("Register error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) return res.status(401).json({ message: "Invalid email or password." });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid email or password." });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      message: "Login successful",
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

/* ------------------ QUIZZES ------------------ */

// Learner: returns quizzes for learner grade
// Admin: if you want all, use /api/quizzes?all=1
app.get("/api/quizzes", authRequired, async (req, res) => {
  try {
    const u = await User.findById(req.user.userId).select("role grade");
    if (!u) return res.status(401).json({ message: "User not found" });

    const wantsAll = String(req.query.all || "") === "1";

    let filter = {};
    if (!(u.role === "admin" && wantsAll)) {
      if (!u.grade) return res.json([]);
      filter.grade = u.grade;
    }

    const quizzes = await Quiz.find(filter)
      .sort({ createdAt: -1 })
      .select(
        "grade title topic questions timeLimitMinutes isFrozen availableFrom availableUntil createdAt updatedAt frozenAt"
      );

    return res.json(quizzes);
  } catch (e) {
    console.error("GET /api/quizzes error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

// Get single quiz (attempt.html uses this)
app.get("/api/quizzes/:id", authRequired, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Not found" });

    const u = await User.findById(req.user.userId).select("role grade");
    if (!u) return res.status(401).json({ message: "User not found" });

    if (u.role !== "admin" && Number(quiz.grade) !== Number(u.grade)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    return res.json(quiz);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// Admin creates quiz (admin-quiz.html POSTs here)
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
      isFrozen: false,
      frozenAt: null,
    });

    return res.status(201).json({ message: "Saved", quizId: quiz._id });
  } catch (e) {
    console.error("POST /api/quizzes error:", e.message);
    return res.status(500).json({ message: "Could not save assessment" });
  }
});

/* ------------------ RESULTS ------------------ */

// helper: check quiz availability server-side
function isUnavailableBySchedule(quiz) {
  const now = new Date();

  if (quiz?.isFrozen) return true;

  if (quiz?.availableFrom) {
    const from = new Date(quiz.availableFrom);
    if (!isNaN(from.getTime()) && now < from) return true;
  }
  if (quiz?.availableUntil) {
    const until = new Date(quiz.availableUntil);
    if (!isNaN(until.getTime()) && now > until) return true;
  }
  return false;
}

// supports your admin quiz fields: textAnswerMode (exact/contains/number_tolerance) + numberTolerance
function compareTextAnswer(userAns, correctAns, mode, tolerance) {
  const uaRaw = cleanSpaces(userAns);
  const caRaw = cleanSpaces(correctAns);
  if (!caRaw) return false;

  const ua = uaRaw.toLowerCase();
  const ca = caRaw.toLowerCase();

  if (mode === "contains") {
    return ua.includes(ca);
  }

  if (mode === "number_tolerance") {
    const uNum = Number(ua);
    const cNum = Number(ca);
    const tol = Number(tolerance);
    if (!Number.isFinite(uNum) || !Number.isFinite(cNum) || !Number.isFinite(tol)) return false;
    return Math.abs(uNum - cNum) <= tol;
  }

  // exact (default)
  return ua === ca;
}

// Submit attempt (attempt.html POSTs here)
app.post("/api/results", authRequired, async (req, res) => {
  try {
    const { quizId, answers, timeTakenSeconds } = req.body;

    if (!quizId || !Array.isArray(answers)) {
      return res.status(400).json({ message: "quizId and answers are required." });
    }

    const userId = req.user.userId;

    // One attempt only
    const existing = await Result.findOne({ userId, quizId }).select("_id");
    if (existing) return res.status(409).json({ message: "Already attempted" });

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: "Assessment not found" });

    if (isUnavailableBySchedule(quiz)) {
      return res.status(403).json({ message: "This assessment is currently unavailable." });
    }

    const qs = Array.isArray(quiz.questions) ? quiz.questions : [];
    const total = qs.length || 0;
    if (total === 0) return res.status(400).json({ message: "Assessment has no questions." });

    let score = 0;

    // Build answers snapshot (matches your ResultSchema)
    const savedAnswers = qs.map((q, i) => {
      const type = String(q.type || "mcq").toLowerCase();
      const hint = q.hint || "";
      const questionText = q.text || "";
      const options = Array.isArray(q.options) ? q.options : [];

      const ans = answers.find((a) => Number(a.questionIndex) === i) || {};

      if (type === "text") {
        const userText = cleanSpaces(ans.textAnswer || "");
        const correctText = cleanSpaces(q.correctText || "");
        const mode = q.textAnswerMode || "exact";
        const tol = q.numberTolerance ?? null;

        const isCorrect = compareTextAnswer(userText, correctText, mode, tol);
        if (isCorrect) score++;

        // map to schema fields
        const answerMode =
          mode === "number_tolerance" ? "number" :
          mode === "exact" ? "exact" :
          "case-insensitive";

        return {
          questionIndex: i,
          type: "text",
          textAnswer: userText,
          correctText,
          hint,
          answerMode,
          tolerance: mode === "number_tolerance" ? Number(tol) : null,
          roundTo: null,
          isCorrect,
          questionText,
          options: [],
        };
      }

      // mcq
      const chosenIndex = Number.isFinite(Number(ans.chosenIndex)) ? Number(ans.chosenIndex) : -1;
      const correctIndex = Number.isFinite(Number(q.correctIndex)) ? Number(q.correctIndex) : -1;

      const isCorrect = chosenIndex === correctIndex && correctIndex >= 0;
      if (isCorrect) score++;

      return {
        questionIndex: i,
        type: "mcq",
        chosenIndex,
        correctIndex,
        textAnswer: "",
        correctText: "",
        hint,
        answerMode: "case-insensitive",
        tolerance: null,
        roundTo: null,
        isCorrect,
        questionText,
        options,
      };
    });

    const percent = Math.round((score / total) * 100);
    const status = percent >= 50 ? "PASS" : "FAIL";

    const saved = await Result.create({
      userId,
      quizId,
      grade: quiz.grade,
      topic: quiz.topic || "General",
      title: quiz.title || "Assessment",
      score,
      total,
      percent,
      status,
      answers: savedAnswers,
      timeTakenSeconds: Number(timeTakenSeconds) || 0,
    });

    return res.status(201).json({
      message: "Saved",
      score,
      total,
      percent,
      status,
      resultId: saved._id,
    });
  } catch (e) {
    console.error("POST /api/results error:", e);
    return res.status(500).json({ message: "Could not save attempt. Please try again." });
  }
});

// Results list for logged-in learner (results.html calls this)
app.get("/api/results/my", authRequired, async (req, res) => {
  try {
    const userId = req.user.userId;

    const rows = await Result.find({ userId })
      .sort({ createdAt: -1 })
      .select("_id createdAt grade topic title percent score total status quizId");

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ message: "Server error" });
  }
});

// Single result for review.html
app.get("/api/results/:id", authRequired, async (req, res) => {
  try {
    const userId = req.user.userId;

    const r = await Result.findById(req.params.id);
    if (!r) return res.status(404).json({ message: "Not found" });

    const u = await User.findById(userId).select("role");
    if (!u) return res.status(401).json({ message: "User not found" });

    if (u.role !== "admin" && String(r.userId) !== String(userId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    return res.json(r);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------ PASSWORD RESET (OTP) ------------------ */

app.post("/api/forgot-password-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    const cleanEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) return res.json({ message: "If the email exists, a reset code has been sent." });

    const otp = makeOtp6();
    const otpHash = hashToken(otp);

    user.resetPasswordTokenHash = otpHash;
    user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendEmail({
      to: user.email,
      subject: "Password reset code",
      text: `Your reset code is: ${otp}. It expires in 10 minutes.`,
      html: `
        <h2>Password Reset Code</h2>
        <p>Your reset code is:</p>
        <h1 style="letter-spacing:3px">${otp}</h1>
        <p>This code expires in <strong>10 minutes</strong>.</p>
      `,
    });

    return res.json({ message: "If the email exists, a reset code has been sent." });
  } catch (err) {
    console.error("forgot-password-otp error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/reset-password-otp", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: "Email, code, and new password are required." });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) return res.status(400).json({ message: "Invalid or expired code." });

    const codeHash = hashToken(String(code).trim());
    const isExpired = !user.resetPasswordExpires || user.resetPasswordExpires.getTime() < Date.now();
    const isMatch = user.resetPasswordTokenHash && user.resetPasswordTokenHash === codeHash;

    if (!isMatch || isExpired) {
      return res.status(400).json({ message: "Invalid or expired code." });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.json({ message: "Password updated. You can login now." });
  } catch (err) {
    console.error("reset-password-otp error:", err.message);
    return res.status(500).json({ message: "Server error" });
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
