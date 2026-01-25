// server.js (FULL UPDATED - COPY & PASTE)
// ✅ Student register: accountType + 8-digit studentNumber
// ✅ Login: /api/login
// ✅ Profile: GET /api/auth/me
// ✅ Password reset (OTP): /api/forgot-password-otp + /api/reset-password-otp
// ✅ Results: POST /api/results + GET /api/results/my + GET /api/results/:id
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
const FROM_EMAIL = (process.env.FROM_EMAIL || "").trim(); // verified in SendGrid
const APP_URL = (process.env.APP_URL || "").replace(/\/$/, ""); // your Netlify URL

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

// ✅ Generate unique 8-digit student number (digits only)
async function generateStudentNumber8() {
  while (true) {
    const num = String(Math.floor(10000000 + Math.random() * 90000000)); // 8 digits
    const exists = await User.findOne({ studentNumber: num }).select("_id");
    if (!exists) return num;
  }
}

// ✅ Generate 6-digit OTP
function makeOtp6() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
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
      subject: "SendGrid test",
      text: "Email sending works.",
      html: "<strong>Email sending works.</strong>",
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

/* ------------------ AUTH ROUTES ------------------ */

// ✅ Profile endpoint used by learner-quizzes.html
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
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ REGISTER (accountType + studentNumber)
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

    // ✅ Welcome email text exactly as you asked
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

// ✅ LOGIN
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

/* ------------------ PASSWORD RESET (OTP) ------------------ */

// ✅ Send 6-digit OTP to email
app.post("/api/forgot-password-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: "Email is required." });

    const cleanEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });

    // always same response (security)
    if (!user) return res.json({ message: "If the email exists, a reset code has been sent." });

    const otp = makeOtp6();
    const otpHash = hashToken(otp);

    user.resetPasswordTokenHash = otpHash;
    user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
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

// ✅ Verify OTP + set new password
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

/* ------------------ RESULTS (LEARNER) ------------------ */

// ✅ Save attempt (attempt.html -> POST /api/results)
app.post("/api/results", authRequired, async (req, res) => {
  try {
    const { quizId, answers, timeTakenSeconds } = req.body || {};
    if (!quizId) return res.status(400).json({ message: "quizId is required." });
    if (!Array.isArray(answers)) return res.status(400).json({ message: "answers must be an array." });

    const userId = req.user.userId;

    // Prevent multiple attempts per quiz
    const existing = await Result.findOne({ userId, quizId }).select("_id");
    if (existing) return res.status(409).json({ message: "Already attempted." });

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: "Assessment not found." });

    // Optional: learner can only attempt their grade (admin bypass)
    const me = await User.findById(userId).select("grade role");
    if (!me) return res.status(401).json({ message: "User not found." });
    if (me.role !== "admin" && Number(me.grade) !== Number(quiz.grade)) {
      return res.status(403).json({ message: "Not allowed." });
    }

    // Unavailable rules
    const now = Date.now();
    const from = quiz.availableFrom ? new Date(quiz.availableFrom).getTime() : null;
    const until = quiz.availableUntil ? new Date(quiz.availableUntil).getTime() : null;

    const unavailable =
      quiz.isFrozen ||
      (from && now < from) ||
      (until && now > until);

    if (unavailable) {
      return res.status(403).json({ message: "This assessment is currently unavailable." });
    }

    // Score calc (MCQ + TEXT)
    let correctCount = 0;
    const total = (quiz.questions || []).length;

    const savedAnswers = (quiz.questions || []).map((q, i) => {
      const type = String(q.type || "mcq").toLowerCase();
      const incoming = answers.find(a => Number(a.questionIndex) === i) || {};
      const hint = q.hint || "";
      const imageUrl = q.imageUrl || "";

      if (type === "text") {
        const userText = String(incoming.textAnswer || "").trim();
        const correctText = String(q.correctText || "").trim();

        const mode = String(q.textAnswerMode || "exact").toLowerCase();
        const tol = Number(q.numberTolerance);

        let isCorrect = false;

        if (mode === "number_tolerance") {
          const u = Number(userText);
          const c = Number(correctText);
          const t = Number.isFinite(tol) ? tol : 0;
          if (Number.isFinite(u) && Number.isFinite(c)) {
            isCorrect = Math.abs(u - c) <= t;
          }
        } else if (mode === "contains") {
          isCorrect = userText.toLowerCase().includes(correctText.toLowerCase());
        } else {
          isCorrect = userText.toLowerCase() === correctText.toLowerCase();
        }

        if (isCorrect) correctCount++;

        return {
          type: "text",
          questionText: q.text,
          hint,
          imageUrl,
          textAnswer: userText,
          correctText,
          isCorrect,
        };
      }

      // MCQ
      const chosenIndex = Number(incoming.chosenIndex);
      const correctIndex = Number(q.correctIndex);

      const isCorrect = Number.isInteger(chosenIndex) && chosenIndex === correctIndex;
      if (isCorrect) correctCount++;

      return {
        type: "mcq",
        questionText: q.text,
        hint,
        imageUrl,
        options: q.options || [],
        chosenIndex: Number.isInteger(chosenIndex) ? chosenIndex : -1,
        correctIndex,
        isCorrect,
      };
    });

    const percent = total > 0 ? Math.round((correctCount / total) * 100) : 0;

    const doc = await Result.create({
      userId,
      quizId,
      grade: quiz.grade,
      topic: quiz.topic,
      title: quiz.title,
      percent,
      timeTakenSeconds: Number(timeTakenSeconds) || 0,
      answers: savedAnswers,
    });

    return res.status(201).json({
      message: "Saved",
      percent: doc.percent,
      resultId: doc._id,
    });
  } catch (err) {
    console.error("POST /api/results error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ List my results (results.html -> GET /api/results/my)
app.get("/api/results/my", authRequired, async (req, res) => {
  try {
    const userId = req.user.userId;

    const rows = await Result.find({ userId })
      .sort({ createdAt: -1 })
      .select("_id createdAt grade topic title percent quizId");

    return res.json(rows);
  } catch (err) {
    console.error("GET /api/results/my error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ One result (review.html -> GET /api/results/:id)
app.get("/api/results/:id", authRequired, async (req, res) => {
  try {
    const userId = req.user.userId;

    const r = await Result.findById(req.params.id);
    if (!r) return res.status(404).json({ message: "Not found" });

    const me = await User.findById(userId).select("role");
    const isOwner = String(r.userId) === String(userId);

    if (!isOwner && me?.role !== "admin") {
      return res.status(403).json({ message: "Not allowed" });
    }

    return res.json(r);
  } catch (err) {
    console.error("GET /api/results/:id error:", err.message);
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
