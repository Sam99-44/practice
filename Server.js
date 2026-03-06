// server.js (FULL UPDATED - COPY & PASTE)
// ✅ Adds MCQ MULTI-SELECT support (chosenIndexes + correctIndexes)
// ✅ Auto-detects multi-select when correctIndexes has 2+ items OR isMultiSelect true
// ✅ Saves multi-select properly into Result for review/results
// ✅ Backward compatible with old single-correct fields (chosenIndex/correctIndex)
// ✅ Saves + returns quiz difficulty (easy/moderate/hard)
// ✅ NEW: Saves + returns quiz paper (paper1/paper2)
// ✅ NEW: PayFast monthly payments
// ✅ NEW: Subscription protection + paidUntil activation

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
import Payment from "./models/Payment.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // ✅ needed for PayFast ITN

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

// ✅ BULK SEND (for notifying many learners)
async function sendBulkEmail({ recipients, subject, html, text }) {
  if (!SENDGRID_API_KEY) throw new Error("Missing SENDGRID_API_KEY on server");
  if (!FROM_EMAIL) throw new Error("Missing FROM_EMAIL on server");
  if (!Array.isArray(recipients) || recipients.length === 0) return;

  const msg = {
    from: FROM_EMAIL,
    subject,
    text: text || undefined,
    html: html || undefined,
    personalizations: recipients.map((email) => ({
      to: [{ email }],
    })),
  };

  try {
    await sgMail.send(msg);
  } catch (err) {
    const detail =
      err?.response?.body?.errors?.map((e) => e.message).join(" | ") ||
      err?.message ||
      "Unknown SendGrid error";
    console.error("SendGrid bulk send failed:", detail);
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
    const num = String(Math.floor(10000000 + Math.random() * 90000000));
    const exists = await User.findOne({ studentNumber: num }).select("_id");
    if (!exists) return num;
  }
}

// Generate 6-digit OTP
function makeOtp6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function cleanSpaces(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function safeInt(v, fallback = null) {
  const n = Number(v);
  if (!Number.isInteger(n)) return fallback;
  return n;
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

// ✅ normalize difficulty
function normalizeDifficulty(v) {
  const d = String(v || "").toLowerCase().trim();
  if (d === "easy" || d === "moderate" || d === "hard") return d;
  return "moderate";
}

// ✅ normalize paper
function normalizePaper(v) {
  const p = String(v || "").toLowerCase().trim();
  if (p === "paper1" || p === "paper2") return p;
  return "paper1";
}

function paperLabel(p) {
  const pp = normalizePaper(p);
  return pp === "paper2" ? "Paper 2" : "Paper 1";
}

// ✅ normalize index arrays (for multi-select)
function normalizeIndexArray(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const x of v) {
    const n = Number(x);
    if (Number.isInteger(n) && n >= 0) out.push(n);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function isMultiMcqCorrect(chosenIdxs, correctIdxs) {
  const a = normalizeIndexArray(chosenIdxs);
  const b = normalizeIndexArray(correctIdxs);
  if (!b.length) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/* ------------------ PAYFAST HELPERS ------------------ */

const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || "";
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || "";
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || "";
const PAYFAST_MODE = String(process.env.PAYFAST_MODE || "true") === "true"; // true = sandbox
const APP_URL = String(process.env.APP_URL || "").replace(/\/$/, "");
const API_URL = String(
  process.env.API_URL || process.env.RENDER_EXTERNAL_URL || ""
).replace(/\/$/, "");

function payfastProcessUrl(testMode) {
  return testMode
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process";
}

function payfastValidateUrl(testMode) {
  return testMode
    ? "https://sandbox.payfast.co.za/eng/query/validate"
    : "https://www.payfast.co.za/eng/query/validate";
}

function pfEncode(val) {
  return encodeURIComponent(String(val).trim()).replace(/%20/g, "+");
}

function buildPayfastSignature(data, passphrase = "") {
  const keys = Object.keys(data)
    .filter(
      (k) =>
        data[k] !== undefined &&
        data[k] !== null &&
        data[k] !== "" &&
        k !== "signature"
    )
    .sort();

  let str = keys.map((k) => `${k}=${pfEncode(data[k])}`).join("&");

  if (passphrase) {
    str += `&passphrase=${pfEncode(passphrase)}`;
  }

  return crypto.createHash("md5").update(str).digest("hex");
}

async function validatePayfastData(pfData) {
  const url = payfastValidateUrl(PAYFAST_MODE);
  const body = new URLSearchParams(pfData).toString();

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const text = await resp.text();
  return resp.ok && String(text || "").trim().toUpperCase() === "VALID";
}

/* ------------------ CORS ------------------ */
const ALLOWED_ORIGINS = [
  process.env.APP_URL,
  process.env.FRONTEND_URL,
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
      if (origin.endsWith(".onrender.com")) return cb(null, true);
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
  const to = String(req.query.to || "practiceallonline@gmail.com").trim();
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
    req.user = decoded;
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

async function paidRequired(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select(
      "role paidUntil subscriptionStatus"
    );

    if (!user) return res.status(401).json({ message: "User not found" });

    if (user.role === "admin") return next();

    const now = new Date();

    if (user.paidUntil && new Date(user.paidUntil) > now) {
      if (user.subscriptionStatus !== "active") {
        user.subscriptionStatus = "active";
        await user.save();
      }
      return next();
    }

    if (user.subscriptionStatus !== "expired") {
      user.subscriptionStatus = "expired";
      await user.save();
    }

    return res.status(403).json({ message: "Subscription inactive. Please pay monthly." });
  } catch (e) {
    console.error("paidRequired error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
}

/* ------------------ AUTH ROUTES ------------------ */

// Profile endpoint used by learner pages + admin pages
app.get("/api/auth/me", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "username email role grade accountType studentNumber province cellphone guardianCellphone subscriptionStatus paidUntil lastPaymentId"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      grade: user.grade,
      accountType: user.accountType,
      studentNumber: user.studentNumber,
      province: user.province || "",
      cellphone: user.cellphone || "",
      guardianCellphone: user.guardianCellphone || "",
      subscriptionStatus: user.subscriptionStatus || "none",
      paidUntil: user.paidUntil || null,
      lastPaymentId: user.lastPaymentId || "",
    });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const {
      username,
      email,
      grade,
      password,
      accountType,
      province,
      cellphone,
      guardianCellphone,
    } = req.body;

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
        return res
          .status(400)
          .json({ message: "Grade is required for Student accounts." });
      }
      gradeNum = Number(grade);
      if (!Number.isInteger(gradeNum) || gradeNum < 8 || gradeNum > 12) {
        return res
          .status(400)
          .json({ message: "Grade must be between 8 and 12." });
      }
    }

    if (String(password).length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters." });
    }

    const cleanUsername = cleanSpaces(username);
    const cleanEmail = String(email).toLowerCase().trim();

    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail)
      return res.status(409).json({ message: "Email already registered." });

    const existingUsername = await User.findOne({ username: cleanUsername });
    if (existingUsername)
      return res.status(409).json({ message: "Username already taken." });

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

      province: cleanSpaces(province || ""),
      cellphone: cleanSpaces(cellphone || ""),
      guardianCellphone: cleanSpaces(guardianCellphone || ""),

      emailVerified: true,
      verifyTokenHash: null,
      verifyTokenExpiresAt: null,
    });

    if (user.accountType === "student") {
      await sendEmail({
        to: user.email,
        subject: `Welcome to Practice Online`,
        text: `Hi ${user.username}, your student number is ${user.studentNumber}.`,
        html: `
          <div style="font-family:Arial,sans-serif; line-height:1.6;">
            <p>Hi ${user.username},</p>
            <p>Welcome to Practice Online.</p>
            <p>Your student number is: <b>${user.studentNumber}</b></p>
            <p>Regards,<br/>Practice Online Team</p>
          </div>
        `,
      });
    } else {
      await sendEmail({
        to: user.email,
        subject: `Welcome to Practice Online`,
        text: `Hi ${user.username}, your account is ready. You have access to learning materials.`,
        html: `
          <div style="font-family:Arial,sans-serif; line-height:1.6;">
            <p>Hi ${user.username},</p>
            <p>Welcome to Practice Online.</p>
            <p>Your account is ready and you have access to learning materials.</p>
            <p>Regards,<br/>Practice Online Team</p>
          </div>
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
        province: user.province || "",
        cellphone: user.cellphone || "",
        guardianCellphone: user.guardianCellphone || "",
        subscriptionStatus: user.subscriptionStatus || "none",
        paidUntil: user.paidUntil || null,
        lastPaymentId: user.lastPaymentId || "",
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
});

/* ------------------ ADMIN STATS ------------------ */
app.get("/api/admin/stats", authRequired, adminOnly, async (req, res) => {
  try {
    const [totalUsers, totalAssessments, byGrade] = await Promise.all([
      User.countDocuments({}),
      Quiz.countDocuments({}),
      Quiz.aggregate([
        { $group: { _id: "$grade", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, grade: "$_id", count: 1 } },
      ]),
    ]);

    return res.json({
      totalUsers,
      totalAssessments,
      totalQuizzes: totalAssessments,
      quizzesByGrade: byGrade,
    });
  } catch (e) {
    console.error("GET /api/admin/stats error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------ QUIZZES ------------------ */

// Learner: returns quizzes for learner grade
// Admin: if you want all, use /api/quizzes?all=1
app.get("/api/quizzes", authRequired, paidRequired, async (req, res) => {
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
        "grade title topic paper difficulty questions timeLimitMinutes instructions isFrozen availableFrom availableUntil createdAt updatedAt frozenAt"
      );

    return res.json(quizzes);
  } catch (e) {
    console.error("GET /api/quizzes error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

// Get single quiz (attempt.html uses this)
app.get("/api/quizzes/:id", authRequired, paidRequired, async (req, res) => {
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

// Admin creates quiz
app.post("/api/quizzes", authRequired, adminOnly, async (req, res) => {
  try {
    const { grade, title, topic, paper, timeLimitMinutes, instructions, questions, difficulty } =
      req.body;

    if (!grade || !title || !topic || !Array.isArray(questions) || questions.length === 0) {
      return res
        .status(400)
        .json({ message: "Grade, topic, title, and questions are required." });
    }

    const g = Number(grade);
    if (!Number.isInteger(g) || g < 8 || g > 12) {
      return res.status(400).json({ message: "Grade must be between 8 and 12." });
    }

    const quizTitle = cleanSpaces(title);
    const quizTopic = cleanSpaces(topic);
    const quizInstructions = String(instructions || "").trim();

    const quizDifficulty = normalizeDifficulty(difficulty);
    const quizPaper = normalizePaper(paper);

    for (const q of questions) {
      const type = String(q?.type || "mcq").toLowerCase();

      if (!cleanSpaces(q?.text)) {
        return res.status(400).json({ message: "Each block must have text." });
      }

      if ("solution" in q && q.solution !== undefined && q.solution !== null) {
        q.solution = String(q.solution);
      }

      if (type === "note") continue;

      const pts = safeInt(q?.points, 1);
      if (!Number.isInteger(pts) || pts < 1) {
        return res.status(400).json({
          message: "Each question must have marks (points) of 1 or more.",
        });
      }

      if (type === "text") {
        if (!cleanSpaces(q?.correctText)) {
          return res.status(400).json({ message: "Typed questions must have correctText." });
        }
        const mode = q?.textAnswerMode || "exact";
        if (!["exact", "contains", "number_tolerance"].includes(mode)) {
          return res.status(400).json({ message: "Invalid textAnswerMode." });
        }
        if (mode === "number_tolerance") {
          const tol = safeNum(q?.numberTolerance, null);
          if (tol === null || tol < 0) {
            return res.status(400).json({ message: "Invalid numberTolerance." });
          }
        }
      } else {
        const opts = Array.isArray(q?.options) ? q.options : [];
        if (opts.length < 2 || opts.some((o) => !cleanSpaces(o))) {
          return res.status(400).json({ message: "MCQ must have at least 2 options." });
        }

        const idxs = normalizeIndexArray(q?.correctIndexes || []);
        const hasMulti = idxs.length >= 2;
        const wantsMulti = Boolean(q?.isMultiSelect) || hasMulti;

        if (wantsMulti) {
          if (idxs.length < 1) {
            return res.status(400).json({ message: "MCQ must have at least 1 correct option." });
          }
          if (idxs.some((i) => i < 0 || i >= opts.length)) {
            return res.status(400).json({ message: "MCQ correctIndexes must be within options." });
          }
          q.isMultiSelect = true;
          q.correctIndexes = idxs;

          if (idxs.length === 1) q.correctIndex = idxs[0];
        } else {
          const ci = safeInt(q?.correctIndex, null);
          if (ci === null || ci < 0 || ci >= opts.length) {
            return res.status(400).json({ message: "MCQ correctIndex must be within options." });
          }
          q.correctIndexes = [ci];
          q.isMultiSelect = false;
        }
      }
    }

    const quiz = await Quiz.create({
      grade: g,
      title: quizTitle,
      topic: quizTopic,
      paper: quizPaper,
      difficulty: quizDifficulty,
      timeLimitMinutes: Number(timeLimitMinutes) || 10,
      questions,
      instructions: quizInstructions,
      isFrozen: false,
      frozenAt: null,
      availableFrom: null,
      availableUntil: null,
    });

    res.status(201).json({ message: "Saved", quizId: quiz._id });

    setImmediate(async () => {
      try {
        const learners = await User.find({
          role: "learner",
          accountType: "student",
          grade: g,
          email: { $exists: true, $ne: "" },
        }).select("email");

        const emails = learners
          .map((u) => String(u.email).toLowerCase().trim())
          .filter(Boolean);

        if (!emails.length) {
          console.log(`No learners found for grade ${g} to notify.`);
          return;
        }

        const subject = `New assessment for Grade ${g}`;
        const link =
          "https://practiceonline.co.za/login.html?next=" +
          encodeURIComponent("learner-quizzes.html");

        const html = `
          <div style="font-family:Arial,sans-serif; line-height:1.6;">
            <p>Hello,</p>
            <p>A new assessment is available for <b>Grade ${g}</b>.</p>
            <p><b>${quizTitle}</b><br/>Topic: ${quizTopic}</p>
            <p>Paper: <b>${paperLabel(quizPaper)}</b></p>
            <p>Difficulty: <b>${quizDifficulty}</b></p>
            <p><a href="${link}" target="_blank">Log in to Practice Online</a></p>
            <p>Regards,<br/>Practice Online Team</p>
          </div>
        `;

        const text = `New assessment for Grade ${g}: ${quizTitle} (Topic: ${quizTopic}). Paper: ${paperLabel(
          quizPaper
        )}. Difficulty: ${quizDifficulty}. Login: ${link}`;

        await sendBulkEmail({ recipients: emails, subject, html, text });
        console.log(`Notified ${emails.length} learners for grade ${g}.`);
      } catch (e) {
        console.error("Quiz notification email failed:", e.message);
      }
    });

    return;
  } catch (e) {
    console.error("POST /api/quizzes error:", e.message);
    return res.status(500).json({ message: "Could not save assessment" });
  }
});

// Admin updates quiz
app.put("/api/quizzes/:id", authRequired, adminOnly, async (req, res) => {
  try {
    const id = req.params.id;

    const update = {};
    const allowed = [
      "grade",
      "title",
      "topic",
      "paper",
      "instructions",
      "timeLimitMinutes",
      "availableFrom",
      "availableUntil",
      "questions",
      "isFrozen",
      "frozenAt",
      "difficulty",
    ];

    for (const k of allowed) {
      if (k in req.body) update[k] = req.body[k];
    }

    if ("grade" in update) {
      const g = Number(update.grade);
      if (!Number.isInteger(g) || g < 8 || g > 12) {
        return res.status(400).json({ message: "Grade must be between 8 and 12." });
      }
      update.grade = g;
    }

    if ("title" in update) update.title = cleanSpaces(update.title);
    if ("topic" in update) update.topic = cleanSpaces(update.topic);
    if ("instructions" in update) update.instructions = String(update.instructions || "");

    if ("difficulty" in update) update.difficulty = normalizeDifficulty(update.difficulty);
    if ("paper" in update) update.paper = normalizePaper(update.paper);

    if ("timeLimitMinutes" in update) {
      const t = Number(update.timeLimitMinutes);
      if (!Number.isFinite(t) || t < 1 || t > 180) {
        return res.status(400).json({ message: "Time limit must be 1–180 minutes." });
      }
      update.timeLimitMinutes = t;
    }

    if ("availableFrom" in update) {
      update.availableFrom = update.availableFrom ? new Date(update.availableFrom) : null;
    }
    if ("availableUntil" in update) {
      update.availableUntil = update.availableUntil ? new Date(update.availableUntil) : null;
    }

    if ("availableFrom" in update && "availableUntil" in update) {
      if (update.availableFrom && update.availableUntil) {
        if (update.availableUntil.getTime() <= update.availableFrom.getTime()) {
          return res.status(400).json({ message: "Available Until must be after Available From." });
        }
      }
    }

    if ("questions" in update) {
      if (!Array.isArray(update.questions) || update.questions.length === 0) {
        return res.status(400).json({ message: "Questions are required." });
      }

      for (const q of update.questions) {
        const type = String(q?.type || "mcq").toLowerCase();

        if (!cleanSpaces(q?.text)) {
          return res.status(400).json({ message: "Each block must have text." });
        }

        if ("solution" in q && q.solution !== undefined && q.solution !== null) {
          q.solution = String(q.solution);
        }

        if (type === "note") continue;

        const pts = safeInt(q?.points, 1);
        if (!Number.isInteger(pts) || pts < 1) {
          return res
            .status(400)
            .json({ message: "Each question must have marks (points) of 1 or more." });
        }

        if (type === "text") {
          if (!cleanSpaces(q?.correctText)) {
            return res.status(400).json({ message: "Typed questions must have correctText." });
          }
          const mode = q?.textAnswerMode || "exact";
          if (!["exact", "contains", "number_tolerance"].includes(mode)) {
            return res.status(400).json({ message: "Invalid textAnswerMode." });
          }
          if (mode === "number_tolerance") {
            const tol = Number(q?.numberTolerance);
            if (!Number.isFinite(tol) || tol < 0) {
              return res.status(400).json({ message: "Invalid numberTolerance." });
            }
          }
        } else {
          const opts = Array.isArray(q?.options) ? q.options : [];
          if (opts.length < 2 || opts.some((o) => !cleanSpaces(o))) {
            return res.status(400).json({ message: "MCQ must have at least 2 options." });
          }

          const idxs = normalizeIndexArray(q?.correctIndexes || []);
          const hasMulti = idxs.length >= 2;
          const wantsMulti = Boolean(q?.isMultiSelect) || hasMulti;

          if (wantsMulti) {
            if (idxs.length < 1) {
              return res
                .status(400)
                .json({ message: "MCQ must have at least 1 correct option." });
            }
            if (idxs.some((i) => i < 0 || i >= opts.length)) {
              return res
                .status(400)
                .json({ message: "MCQ correctIndexes must be within options." });
            }
            q.isMultiSelect = true;
            q.correctIndexes = idxs;
            if (idxs.length === 1) q.correctIndex = idxs[0];
          } else {
            const ci = Number(q?.correctIndex);
            if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length) {
              return res.status(400).json({ message: "MCQ correctIndex must be within options." });
            }
            q.correctIndexes = [ci];
            q.isMultiSelect = false;
          }
        }
      }
    }

    const quiz = await Quiz.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!quiz) return res.status(404).json({ message: "Not found" });

    return res.json(quiz);
  } catch (e) {
    console.error("PUT /api/quizzes/:id error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

// Admin deletes quiz
app.delete("/api/quizzes/:id", authRequired, adminOnly, async (req, res) => {
  try {
    const quiz = await Quiz.findByIdAndDelete(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Not found" });
    return res.json({ message: "Deleted" });
  } catch (e) {
    console.error("DELETE /api/quizzes/:id error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------ RESULTS ------------------ */

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

// ✅ parse numbers AND fractions like 1/2 or -3/4
function parseNumberOrFraction(input) {
  const s = String(input || "")
    .trim()
    .replace(/,/g, ".")
    .replace(/−/g, "-");

  if (!s) return null;

  const m = s.match(/^([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
    return a / b;
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeTextAnswer(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/−/g, "-");
}

function compareTextAnswer(userAns, correctAns, mode, tolerance) {
  const uaRaw = String(userAns || "");
  const caRaw = String(correctAns || "");
  if (!caRaw.trim()) return false;

  const uNum = parseNumberOrFraction(uaRaw);
  const cNum = parseNumberOrFraction(caRaw);

  if (mode === "number_tolerance") {
    const tol = Number(tolerance);
    if (uNum === null || cNum === null || !Number.isFinite(tol) || tol < 0) return false;
    return Math.abs(uNum - cNum) <= tol;
  }

  if (uNum !== null && cNum !== null) {
    return Math.abs(uNum - cNum) <= 1e-12;
  }

  const ua = normalizeTextAnswer(uaRaw);
  const ca = normalizeTextAnswer(caRaw);

  if (mode === "contains") return ua.includes(ca);

  return ua === ca;
}

// Submit attempt
app.post("/api/results", authRequired, paidRequired, async (req, res) => {
  try {
    const { quizId, answers, timeTakenSeconds } = req.body;

    if (!quizId || !Array.isArray(answers)) {
      return res.status(400).json({ message: "quizId and answers are required." });
    }

    const userId = req.user.userId;

    const me = await User.findById(userId).select("role");
    if (!me) return res.status(401).json({ message: "User not found" });

    const isAdmin = me.role === "admin";

    if (!isAdmin) {
      const existing = await Result.findOne({ userId, quizId }).select("_id");
      if (existing) return res.status(409).json({ message: "Already attempted" });
    }

    let attemptNo = 1;
    if (isAdmin) {
      const prev = await Result.countDocuments({ userId, quizId, isAdminAttempt: true });
      attemptNo = prev + 1;
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: "Assessment not found" });

    if (isUnavailableBySchedule(quiz)) {
      return res.status(403).json({ message: "This assessment is currently unavailable." });
    }

    const qs = Array.isArray(quiz.questions) ? quiz.questions : [];
    if (!qs.length) return res.status(400).json({ message: "Assessment has no questions." });

    const gradedQs = qs.filter((q) => String(q.type || "mcq").toLowerCase() !== "note");
    const totalPoints = gradedQs.reduce((sum, q) => sum + (Number(q.points) || 1), 0);

    let scorePoints = 0;

    const savedAnswers = qs.map((q, i) => {
      const type = String(q.type || "mcq").toLowerCase();

      const hint = q.hint || "";
      const questionText = q.text || "";
      const options = Array.isArray(q.options) ? q.options : [];
      const qPoints = type === "note" ? 0 : (Number(q.points) || 1);

      const solution = String(q.solution || "").trim();

      const ans = answers.find((a) => Number(a.questionIndex) === i) || {};

      if (type === "note") {
        return {
          questionIndex: i,
          type: "note",
          points: 0,
          earnedPoints: 0,

          chosenIndex: -1,
          correctIndex: -1,

          isMultiSelect: false,
          chosenIndexes: [],
          correctIndexes: [],

          textAnswer: "",
          correctText: "",
          hint: "",
          solution: "",
          answerMode: "case-insensitive",
          tolerance: null,
          roundTo: null,
          isCorrect: false,
          questionText,
          options: [],
        };
      }

      if (type === "text") {
        const userText = cleanSpaces(ans.textAnswer || "");
        const correctText = cleanSpaces(q.correctText || "");
        const mode = q.textAnswerMode || "exact";
        const tol = q.numberTolerance ?? 0;

        const isCorrect = compareTextAnswer(userText, correctText, mode, tol);
        const earned = isCorrect ? qPoints : 0;
        scorePoints += earned;

        const answerMode =
          mode === "number_tolerance"
            ? "number"
            : mode === "exact"
            ? "exact"
            : "case-insensitive";

        return {
          questionIndex: i,
          type: "text",
          points: qPoints,
          earnedPoints: earned,

          chosenIndex: -1,
          correctIndex: -1,
          isMultiSelect: false,
          chosenIndexes: [],
          correctIndexes: [],

          textAnswer: userText,
          correctText,
          hint,
          solution,
          answerMode,
          tolerance: mode === "number_tolerance" ? Number(tol) : null,
          roundTo: null,
          isCorrect,
          questionText,
          options: [],
        };
      }

      const correctIndexes = normalizeIndexArray(q.correctIndexes || []);
      const multiByCorrects = correctIndexes.length > 1;
      const isMultiSelect = Boolean(q.isMultiSelect) || multiByCorrects;

      let isCorrect = false;

      let chosenIndex = -1;
      let correctIndex = Number.isInteger(Number(q.correctIndex)) ? Number(q.correctIndex) : -1;

      let chosenIndexes = [];
      let correctIndexesSnap = correctIndexes;

      if (isMultiSelect) {
        chosenIndexes = normalizeIndexArray(ans.chosenIndexes || []);
        isCorrect = isMultiMcqCorrect(chosenIndexes, correctIndexes);

        chosenIndex = chosenIndexes.length ? chosenIndexes[0] : -1;
        correctIndex = correctIndexes.length ? correctIndexes[0] : -1;
      } else {
        chosenIndex = Number.isFinite(Number(ans.chosenIndex)) ? Number(ans.chosenIndex) : -1;
        correctIndex = Number.isFinite(Number(q.correctIndex)) ? Number(q.correctIndex) : -1;
        isCorrect = chosenIndex === correctIndex && correctIndex >= 0;

        chosenIndexes = chosenIndex >= 0 ? [chosenIndex] : [];
        correctIndexesSnap = correctIndex >= 0 ? [correctIndex] : [];
      }

      const earned = isCorrect ? qPoints : 0;
      scorePoints += earned;

      return {
        questionIndex: i,
        type: "mcq",
        points: qPoints,
        earnedPoints: earned,

        chosenIndex,
        correctIndex,

        isMultiSelect,
        chosenIndexes,
        correctIndexes: correctIndexesSnap,

        textAnswer: "",
        correctText: "",
        hint,
        solution,
        answerMode: "case-insensitive",
        tolerance: null,
        roundTo: null,
        isCorrect,
        questionText,
        options,
      };
    });

    const percent = totalPoints > 0 ? Math.round((scorePoints / totalPoints) * 100) : 0;
    const status = percent >= 50 ? "PASS" : "FAIL";

    const saved = await Result.create({
      userId,
      quizId,
      grade: quiz.grade,
      topic: quiz.topic || "General",
      title: quiz.title || "Assessment",
      instructions: String(quiz.instructions || "").trim(),
      paper: quiz.paper || "paper1",
      score: scorePoints,
      total: totalPoints,
      percent,
      status,
      answers: savedAnswers,
      timeTakenSeconds: Number(timeTakenSeconds) || 0,
      isAdminAttempt: isAdmin,
      attemptNo,
      attemptedAt: new Date(),
    });

    return res.status(201).json({
      message: "Saved",
      score: scorePoints,
      total: totalPoints,
      percent,
      status,
      resultId: saved._id,
    });
  } catch (e) {
    if (String(e?.code) === "11000") {
      return res.status(409).json({ message: "Already attempted" });
    }
    console.error("POST /api/results error:", e);
    return res.status(500).json({ message: "Could not save attempt. Please try again." });
  }
});

// Results list for logged-in learner
app.get("/api/results/my", authRequired, paidRequired, async (req, res) => {
  try {
    const userId = req.user.userId;

    const rows = await Result.find({ userId })
      .sort({ createdAt: -1 })
      .select("_id createdAt grade topic title paper percent score total status quizId attemptNo isAdminAttempt");

    return res.json(rows);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// Single result for review.html
app.get("/api/results/:id", authRequired, paidRequired, async (req, res) => {
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
        <div style="font-family:Arial,sans-serif; line-height:1.6;">
          <p>Your reset code is:</p>
          <p style="font-size:26px; font-weight:800; letter-spacing:3px;">${otp}</p>
          <p>This code expires in 10 minutes.</p>
        </div>
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

/* ------------------ PAYFAST ------------------ */

// Start monthly payment
app.post("/api/payfast/initiate", authRequired, async (req, res) => {
  try {
    if (!PAYFAST_MERCHANT_ID || !PAYFAST_MERCHANT_KEY) {
      return res.status(500).json({ message: "PayFast credentials missing." });
    }

    if (!APP_URL) {
      return res.status(500).json({ message: "APP_URL is missing." });
    }

    if (!API_URL) {
      return res.status(500).json({ message: "API_URL is missing." });
    }

    const { amount, item_name } = req.body;

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "Invalid amount." });
    }

    const currentUser = await User.findById(req.user.userId).select("email role");
    if (!currentUser) {
      return res.status(401).json({ message: "User not found." });
    }

    if (currentUser.role === "admin") {
      return res.status(400).json({ message: "Admins do not need a subscription." });
    }

    const m_payment_id = `M-${req.user.userId}-${Date.now()}`;

    await Payment.create({
      userId: req.user.userId,
      m_payment_id,
      plan: "monthly",
      amount: amt,
      status: "PENDING",
    });

    const data = {
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: `${APP_URL}/payment-success.html`,
      cancel_url: `${APP_URL}/payment-cancel.html`,
      notify_url: `${API_URL}/api/payfast/itn`,
      m_payment_id,
      amount: amt.toFixed(2),
      item_name: String(item_name || "Practice Online Monthly Subscription").slice(0, 100),
      name_first: currentUser.email ? currentUser.email.split("@")[0] : "Practice",
      name_last: "Online",
      email_address: currentUser.email || FROM_EMAIL || "no-reply@practiceonline.co.za",
    };

    data.signature = buildPayfastSignature(data, PAYFAST_PASSPHRASE);

    return res.json({
      action: payfastProcessUrl(PAYFAST_MODE),
      fields: data,
    });
  } catch (e) {
    console.error("POST /api/payfast/initiate error:", e.message);
    return res.status(500).json({ message: "Could not start payment." });
  }
});

// PayFast ITN
app.post("/api/payfast/itn", async (req, res) => {
  try {
    const pfData = { ...req.body };

    console.log("PayFast ITN received:", pfData);

    if (!pfData || !pfData.m_payment_id) {
      return res.status(400).send("Missing ITN data");
    }

    const receivedSignature = String(pfData.signature || "");
    const calculatedSignature = buildPayfastSignature(pfData, PAYFAST_PASSPHRASE);

    if (receivedSignature !== calculatedSignature) {
      console.error("PayFast ITN invalid signature");
      return res.status(400).send("Invalid signature");
    }

    const valid = await validatePayfastData(pfData);
    if (!valid) {
      console.error("PayFast ITN invalid data");
      return res.status(400).send("Invalid data");
    }

    const payment = await Payment.findOne({ m_payment_id: pfData.m_payment_id });
    if (!payment) {
      console.error("PayFast ITN payment not found:", pfData.m_payment_id);
      return res.status(200).send("OK");
    }

    const paymentStatus = String(pfData.payment_status || "").toUpperCase();
    const amountGross = Number(pfData.amount_gross || 0);

    if (Number(payment.amount).toFixed(2) !== Number(amountGross).toFixed(2)) {
      payment.status = "FAILED";
      payment.payment_status_raw = paymentStatus;
      payment.pf_payment_id = String(pfData.pf_payment_id || "");
      payment.amount_gross = amountGross;
      payment.amount_fee = Number(pfData.amount_fee || 0);
      payment.amount_net = Number(pfData.amount_net || 0);
      payment.raw = pfData;
      await payment.save();

      console.error("PayFast amount mismatch:", payment.m_payment_id);
      return res.status(200).send("OK");
    }

    if (paymentStatus === "COMPLETE") {
      payment.status = "COMPLETE";
    } else if (paymentStatus === "CANCELLED") {
      payment.status = "CANCELLED";
    } else {
      payment.status = "FAILED";
    }

    payment.payment_status_raw = paymentStatus;
    payment.pf_payment_id = String(pfData.pf_payment_id || "");
    payment.amount_gross = amountGross;
    payment.amount_fee = Number(pfData.amount_fee || 0);
    payment.amount_net = Number(pfData.amount_net || 0);
    payment.raw = pfData;

    await payment.save();

    if (payment.status === "COMPLETE") {
      const user = await User.findById(payment.userId).select(
        "paidUntil subscriptionStatus lastPaymentId premium premiumActivatedAt premiumExpiresAt"
      );

      if (user) {
        const now = new Date();
        const base =
          user.paidUntil && new Date(user.paidUntil) > now ? new Date(user.paidUntil) : now;

        const newUntil = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

        user.paidUntil = newUntil;
        user.subscriptionStatus = "active";
        user.lastPaymentId = payment.m_payment_id;

        // keep old premium fields in sync so old pages don’t break
        user.premium = true;
        user.premiumActivatedAt = now;
        user.premiumExpiresAt = newUntil;

        await user.save();
      }
    }

    return res.status(200).send("OK");
  } catch (e) {
    console.error("POST /api/payfast/itn error:", e.message);
    return res.status(500).send("Server error");
  }
});

/* ------------------ OPTIONAL: FRIENDLY 404 FOR API ------------------ */
app.use("/api", (req, res) => {
  res.status(404).json({ message: "API route not found" });
});

/* ------------------ ERROR HANDLER (CORS ETC.) ------------------ */
app.use((err, req, res, next) => {
  if (String(err?.message || "").startsWith("CORS blocked:")) {
    return res.status(403).json({ message: err.message });
  }
  console.error("Unhandled error:", err?.message || err);
  res.status(500).json({ message: "Server error" });
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

/*
✅ IMPORTANT:
You also need these env vars:

PAYFAST_MERCHANT_ID=10046445
PAYFAST_MERCHANT_KEY=irdjtc52y9kem
PAYFAST_MODE=true
PAYFAST_PASSPHRASE=your_passphrase
APP_URL=https://practiceonline.co.za
API_URL=https://practice-backend-msgn.onrender.com

✅ IMPORTANT:
Create models/Payment.js

✅ IMPORTANT:
Update models/User.js with:
- subscriptionStatus
- paidUntil
- lastPaymentId

✅ IMPORTANT:
To truly STORE paper in MongoDB you must add:
- `paper` field to models/Quiz.js schema
- `paper` field to models/Result.js schema
*/
