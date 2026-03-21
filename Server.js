// server.js (FULL UPDATED - COPY & PASTE)
// ✅ Adds profile routes
// ✅ Adds profile photo upload/remove
// ✅ Adds profile info update
// ✅ Adds static /uploads serving
// ✅ Keeps current studentNumber system
// ✅ Adds MCQ MULTI-SELECT support (chosenIndexes + correctIndexes)
// ✅ Auto-detects multi-select when correctIndexes has 2+ items OR isMultiSelect true
// ✅ Saves multi-select properly into Result for review/results
// ✅ Backward compatible with old single-correct fields (chosenIndex/correctIndex)
// ✅ Saves + returns quiz difficulty (easy/moderate/hard)
// ✅ Saves + returns quiz paper (paper1/paper2)
// ✅ PayFast monthly payments
// ✅ Returns subscription info on /api/auth/me
// ✅ Strong email validation
// ✅ Email verification routes
// ✅ Login blocks unverified users
// ✅ Register route protection with express-rate-limit
// ✅ Free trial system
// ✅ Access-status routes
// ✅ Manual payment routes
// ✅ Admin leaderboard filters
// ✅ Admin leaderboard statistics
// ✅ Admin sees all pages
// ✅ Tester sees all pages
// ✅ Tester can test subscription/payments/features
// ✅ Editor can add/edit quizzes
// ✅ Learners can practice without subscription during development
// ✅ Draft / publish / scheduled publish support
// ✅ Available from / until support
// ✅ Optional learner email on publish
// ✅ Auto-publish scheduled quizzes
// ✅ Final PUT route fixed so edit page updates MongoDB correctly
// ✅ Announcement system added
// ✅ Profile announcement summary added
// ✅ Class RSVP (accept/reject) added

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import sgMail from "@sendgrid/mail";
import rateLimit from "express-rate-limit";

import Quiz from "./models/Quiz.js";
import User from "./models/User.js";
import Result from "./models/Result.js";
import Payment from "./models/Payment.js";

import accessRoutes from "./routes/access.js";
import paymentRoutes from "./routes/payments.js";
import manualPaymentsRoutes from "./routes/manualPayments.js";
import { addDays } from "./utils/access.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsRoot = path.join(__dirname, "uploads");
const profileUploadDir = path.join(uploadsRoot, "profile");
fs.mkdirSync(profileUploadDir, { recursive: true });

app.use("/uploads", express.static(uploadsRoot));

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

function makeVerifyToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function generateLearnerNumber(accountType = "student") {
  const yearShort = String(new Date().getFullYear()).slice(-2);

  while (true) {
    const random5 = String(Math.floor(10000 + Math.random() * 90000));

    const learnerNumber =
      accountType === "materials"
        ? `P${yearShort}${random5}`
        : `PO${yearShort}${random5}`;

    const exists = await User.findOne({
      $or: [
        { studentNumber: learnerNumber },
        { learnerNumber: learnerNumber },
      ],
    }).select("_id");

    if (!exists) return learnerNumber;
  }
}

function makeMaterialsPassword() {
  const year = new Date().getFullYear();
  const lastTwo = String(year).slice(-2);
  const random5 = String(Math.floor(10000 + Math.random() * 90000));
  return `P${lastTwo}${random5}`;
}

function isValidEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

async function generateStudentNumber8() {
  while (true) {
    const num = String(Math.floor(10000000 + Math.random() * 90000000));
    const exists = await User.findOne({ studentNumber: num }).select("_id");
    if (!exists) return num;
  }
}

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

function normalizeDifficulty(v) {
  const d = String(v || "").toLowerCase().trim();
  if (d === "easy" || d === "moderate" || d === "hard") return d;
  return "moderate";
}

function normalizePaper(v) {
  const p = String(v || "").toLowerCase().trim();
  if (p === "paper1" || p === "paper2") return p;
  return "paper1";
}

function paperLabel(p) {
  const pp = normalizePaper(p);
  return pp === "paper2" ? "Paper 2" : "Paper 1";
}

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
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function toPublicProfile(user) {
  return {
    _id: user._id,
    fullName: user.fullName || "",
    username: user.username || "",
    email: user.email || "",
    grade: user.grade ?? "",
    accountType: user.accountType || "",
    role: user.role || "",
    learnerNumber: user.learnerNumber || user.studentNumber || "",
    profileHeadline: user.profileHeadline || "",
    profilePhoto: user.profilePhoto || "",
    joinedYear: user.createdAt ? new Date(user.createdAt).getFullYear() : "",
  };
}

function getPeriodStart(period) {
  const now = new Date();

  if (period === "weekly") {
    const d = new Date(now);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (period === "monthly") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  return null;
}

function safeTrim(v) {
  return String(v || "").trim();
}

function isPrivilegedRole(role) {
  return ["admin", "tester"].includes(String(role || "").toLowerCase().trim());
}

function canManageQuizzes(role) {
  return ["admin", "editor", "tester"].includes(
    String(role || "").toLowerCase().trim()
  );
}

function validDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? "INVALID" : d;
}

const profilePhotoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, profileUploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `user-${req.user.userId}-${Date.now()}${safeExt}`);
  },
});

function profilePhotoFilter(req, file, cb) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only JPG, PNG, and WEBP images are allowed."));
  }
  cb(null, true);
}

const uploadProfilePhoto = multer({
  storage: profilePhotoStorage,
  fileFilter: profilePhotoFilter,
  limits: { fileSize: 3 * 1024 * 1024 },
});

/* ------------------ RATE LIMIT ------------------ */
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many registration attempts. Please try again later.",
  },
});

/* ------------------ PAYFAST HELPERS ------------------ */
const PAYFAST_MERCHANT_ID = (process.env.PAYFAST_MERCHANT_ID || "").trim();
const PAYFAST_MERCHANT_KEY = (process.env.PAYFAST_MERCHANT_KEY || "").trim();
const PAYFAST_PASSPHRASE = (process.env.PAYFAST_PASSPHRASE || "").trim();
const PAYFAST_MODE = String(process.env.PAYFAST_MODE || "false").trim() === "true";
const APP_URL = String(process.env.APP_URL || "").trim().replace(/\/$/, "");
const API_URL = String(
  process.env.API_URL || process.env.RENDER_EXTERNAL_URL || ""
).trim().replace(/\/$/, "");

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
  let output = "";

  for (const key in data) {
    if (
      Object.prototype.hasOwnProperty.call(data, key) &&
      key !== "signature" &&
      data[key] !== undefined &&
      data[key] !== null &&
      data[key] !== ""
    ) {
      output += `${key}=${pfEncode(data[key])}&`;
    }
  }

  if (passphrase) {
    output += `passphrase=${pfEncode(passphrase)}&`;
  }

  output = output.slice(0, -1);
  return crypto.createHash("md5").update(output).digest("hex");
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

    if (!isPrivilegedRole(u.role)) {
      return res.status(403).json({ message: "Admin/tester only" });
    }

    next();
  } catch {
    res.status(500).json({ message: "Server error" });
  }
}

async function quizManagerOnly(req, res, next) {
  try {
    const u = await User.findById(req.user.userId).select("role");
    if (!u) return res.status(401).json({ message: "User not found" });

    if (!canManageQuizzes(u.role)) {
      return res.status(403).json({ message: "Admin/editor/tester only" });
    }

    next();
  } catch {
    res.status(500).json({ message: "Server error" });
  }
}

/* ------------------ PUBLISH HELPERS ------------------ */
async function sendPublishedQuizEmails(quiz) {
  if (!quiz || !quiz.sendPublishEmail) return;

  try {
    const learners = await User.find({
      role: "learner",
      accountType: "student",
      grade: quiz.grade,
      email: { $exists: true, $ne: "" },
      emailVerified: true,
    }).select("email");

    const emails = learners
      .map((u) => String(u.email).toLowerCase().trim())
      .filter(Boolean);

    if (!emails.length) {
      console.log(`No learners found for grade ${quiz.grade} to notify.`);
      return;
    }

    const subject = `New assessment for Grade ${quiz.grade}`;
    const link =
      "https://practiceonline.co.za/login.html?next=" +
      encodeURIComponent("learner-quizzes.html");

    const html = `
      <div style="font-family:Arial,sans-serif; line-height:1.6;">
        <p>Hello,</p>
        <p>A new assessment is available for <b>Grade ${quiz.grade}</b>.</p>
        <p><b>${quiz.title}</b><br/>Topic: ${quiz.topic}</p>
        <p>Paper: <b>${paperLabel(quiz.paper)}</b></p>
        <p>Difficulty: <b>${quiz.difficulty}</b></p>
        <p><a href="${link}" target="_blank">Log in to Practice Online</a></p>
        <p>Regards,<br/>Practice Online Team</p>
      </div>
    `;

    const text = `New assessment for Grade ${quiz.grade}: ${quiz.title} (Topic: ${quiz.topic}). Paper: ${paperLabel(
      quiz.paper
    )}. Difficulty: ${quiz.difficulty}. Login: ${link}`;

    await sendBulkEmail({ recipients: emails, subject, html, text });
    console.log(`Notified ${emails.length} learners for grade ${quiz.grade}.`);
  } catch (e) {
    console.error("Quiz publish email failed:", e.message);
  }
}

async function autoPublishScheduledQuizzes() {
  try {
    const now = new Date();

    const dueQuizzes = await Quiz.find({
      isPublished: true,
      publishAt: { $ne: null, $lte: now },
      publishedAt: null,
    });

    for (const quiz of dueQuizzes) {
      quiz.publishedAt = now;
      await quiz.save();

      if (quiz.sendPublishEmail) {
        await sendPublishedQuizEmails(quiz);
      }
    }
  } catch (e) {
    console.error("autoPublishScheduledQuizzes error:", e.message);
  }
}

/* ------------------ ANNOUNCEMENT MODEL ------------------ */
const AnnouncementResponseSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    response: {
      type: String,
      enum: ["accepted", "rejected"],
      required: true,
    },
    respondedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const AnnouncementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    grade: {
      type: String,
      enum: ["grade8", "grade9", "grade10", "grade11", "grade12", "allGrades"],
      default: "allGrades",
      index: true,
    },
    category: {
      type: String,
      enum: ["general", "class", "quiz", "all"],
      default: "general",
      index: true,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    sendToStudents: {
      type: Boolean,
      default: false,
    },
    urgentNotice: {
      type: Boolean,
      default: false,
    },
    meetingLink: {
      type: String,
      default: "",
      trim: true,
    },
    meetingDate: {
      type: String,
      default: "",
      trim: true,
    },
    meetingTime: {
      type: String,
      default: "",
      trim: true,
    },
    dueDate: {
      type: String,
      default: "",
      trim: true,
    },
    quizStatus: {
      type: String,
      default: "Open",
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    responses: [AnnouncementResponseSchema],
  },
  { timestamps: true }
);

AnnouncementSchema.index({ category: 1, grade: 1, isPublished: 1, createdAt: -1 });

const Announcement =
  mongoose.models.Announcement || mongoose.model("Announcement", AnnouncementSchema);

/* ------------------ ANNOUNCEMENT HELPERS ------------------ */
function normalizeAnnouncementGrade(value = "") {
  const v = String(value || "").trim();
  const allowed = ["grade8", "grade9", "grade10", "grade11", "grade12", "allGrades"];
  return allowed.includes(v) ? v : "allGrades";
}

function normalizeAnnouncementCategory(value = "") {
  const v = String(value || "").trim().toLowerCase();
  const allowed = ["general", "class", "quiz", "all"];
  return allowed.includes(v) ? v : "general";
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function gradeToAnnouncementGrade(grade) {
  const n = Number(grade);
  if ([8, 9, 10, 11, 12].includes(n)) return `grade${n}`;
  return "allGrades";
}

function stripAnnouncementForUser(announcement, userId) {
  const obj = announcement.toObject ? announcement.toObject() : { ...announcement };
  const responses = Array.isArray(obj.responses) ? obj.responses : [];
  const found = responses.find((r) => String(r.student) === String(userId));
  obj.learnerResponse = found ? found.response : "pending";
  delete obj.responses;
  return obj;
}

/* ------------------ AUTH ROUTES ------------------ */

app.get("/api/auth/me", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "fullName username email role grade accountType studentNumber province district gender cellphone guardianCellphone emailVerified subscriptionStatus paidUntil lastPaymentId premium premiumExpiresAt trialActive trialStartDate trialEndDate trialExpiredAt accessStatus trialDaysLeft"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    const now = new Date();
    let effectiveStatus = user.subscriptionStatus || "none";
    let effectivePaidUntil = user.paidUntil || null;

    if (
      (!effectivePaidUntil || new Date(effectivePaidUntil) <= now) &&
      user.premium &&
      user.premiumExpiresAt &&
      new Date(user.premiumExpiresAt) > now
    ) {
      effectiveStatus = "active";
      effectivePaidUntil = user.premiumExpiresAt;
    }

    return res.json({
      _id: user._id,
      fullName: user.fullName || "",
      username: user.username,
      email: user.email,
      role: user.role,
      grade: user.grade,
      accountType: user.accountType,
      studentNumber: user.studentNumber,
      province: user.province || "",
      district: user.district || "",
      gender: user.gender || "",
      cellphone: user.cellphone || "",
      guardianCellphone: user.guardianCellphone || "",
      emailVerified: !!user.emailVerified,
      subscriptionStatus: effectiveStatus,
      paidUntil: effectivePaidUntil,
      lastPaymentId: user.lastPaymentId || "",
      trialActive: !!user.trialActive,
      trialStartDate: user.trialStartDate || null,
      trialEndDate: user.trialEndDate || null,
      accessStatus: user.accessStatus || "expired",
      trialDaysLeft: user.trialDaysLeft || 0,
    });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// REGISTER
app.post("/api/register", registerLimiter, async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      grade,
      accountType,
      province,
      district,
      gender,
      cellphone,
      guardianCellphone,
      firstName,
      surname,
      schoolName,
      currentMarkRange,
    } = req.body;

    if (!username) {
      return res.status(400).json({ message: "Username is required." });
    }
    if (!firstName) {
      return res.status(400).json({ message: "Name is required." });
    }
    if (!surname) {
      return res.status(400).json({ message: "Surname is required." });
    }
    if (!schoolName) {
      return res.status(400).json({ message: "School name is required." });
    }
    if (!cellphone) {
      return res.status(400).json({ message: "Cellphone number is required." });
    }
    if (!guardianCellphone) {
      return res.status(400).json({ message: "Guardian cellphone is required." });
    }
    if (!province) {
      return res.status(400).json({ message: "Province is required." });
    }
    if (!currentMarkRange) {
      return res.status(400).json({ message: "Current mark is required." });
    }
    if (!email || !accountType) {
      return res.status(400).json({
        message: "Email and account type are required.",
      });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters.",
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

    const cleanUsername = cleanSpaces(username);
    const cleanEmail = String(email || "").toLowerCase().trim();

    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    const existingEmail = await User.findOne({ email: cleanEmail }).select("_id");
    if (existingEmail) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const existingUsername = await User.findOne({ username: cleanUsername }).select("_id");
    if (existingUsername) {
      return res.status(409).json({ message: "Username already taken." });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const learnerNumber = await generateLearnerNumber(accountType);

    const rawVerifyToken = makeVerifyToken();
    const verifyTokenHash = hashToken(rawVerifyToken);
    const verifyTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const now = new Date();
    const trialDays = 7;

    const user = await User.create({
      fullName: cleanSpaces(`${firstName} ${surname}`),
      firstName: cleanSpaces(firstName),
      surname: cleanSpaces(surname),
      schoolName: cleanSpaces(schoolName),
      currentMarkRange: cleanSpaces(currentMarkRange),
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      role: "learner",
      accountType,
      learnerNumber,
      studentNumber: learnerNumber,
      grade: gradeNum,
      profileHeadline: "",
      profilePhoto: "",
      province: cleanSpaces(province || ""),
      district: cleanSpaces(district || ""),
      gender: String(gender || "").trim(),
      cellphone: cleanSpaces(cellphone || ""),
      guardianCellphone: cleanSpaces(guardianCellphone || ""),
      emailVerified: false,
      verifyTokenHash,
      verifyTokenExpiresAt,
      trialActive: true,
      trialStartDate: now,
      trialEndDate: addDays(now, trialDays),
    });

    const verifyUrl = `${APP_URL}/verify-email.html?token=${encodeURIComponent(
      rawVerifyToken
    )}&email=${encodeURIComponent(user.email)}`;

    await sendEmail({
      to: user.email,
      subject: "Verify your Practice Online email",
      text: `Hi ${user.username}, your learner number is ${learnerNumber}. Verify your email here: ${verifyUrl}`,
      html: `
        <div style="font-family:Arial,sans-serif; line-height:1.6;">
          <p>Hi ${user.username},</p>
          <p>Welcome to Practice Online.</p>
          <p>Your learner number is: <b>${learnerNumber}</b></p>
          <p>Please verify your email address by clicking the link below:</p>
          <p><a href="${verifyUrl}" target="_blank">Verify Email</a></p>
          <p>This link expires in 24 hours.</p>
          <p>Regards,<br/>Practice Online Team</p>
        </div>
      `,
    });

    return res.status(201).json({
      message: "Account created. Please verify your email before logging in.",
      accountType: user.accountType,
      learnerNumber,
      studentNumber: learnerNumber,
    });
  } catch (err) {
    console.error("Register error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
});

// EMAIL VERIFY
app.get("/api/auth/verify", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    const email = String(req.query.email || "").trim().toLowerCase();

    if (!token || !email) {
      return res.status(400).json({ message: "Invalid link." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid link." });
    }

    const hashed = hashToken(token);

    if (
      user.emailVerified ||
      !user.verifyTokenHash ||
      user.verifyTokenHash !== hashed ||
      !user.verifyTokenExpiresAt ||
      user.verifyTokenExpiresAt < new Date()
    ) {
      return res.status(400).json({ message: "Token expired or invalid." });
    }

    user.emailVerified = true;
    user.verifyTokenHash = "";
    user.verifyTokenExpiresAt = null;
    await user.save();

    return res.json({ message: "Email verified successfully." });
  } catch (err) {
    console.error("Verify email error:", err.message);
    return res.status(500).json({ message: "Server error." });
  }
});

// RESEND VERIFICATION EMAIL
app.post("/api/resend-verification-email", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const cleanEmail = String(email || "").trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.json({ message: "If the email exists, a verification email has been sent." });
    }

    if (user.emailVerified) {
      return res.json({ message: "This email is already verified." });
    }

    const rawVerifyToken = makeVerifyToken();
    user.verifyTokenHash = hashToken(rawVerifyToken);
    user.verifyTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    const verifyUrl = `${APP_URL}/verify-email.html?token=${encodeURIComponent(
      rawVerifyToken
    )}&email=${encodeURIComponent(user.email)}`;

    await sendEmail({
      to: user.email,
      subject: "Verify your Practice Online email",
      text: `Hi ${user.username}, verify your email here: ${verifyUrl}`,
      html: `
        <div style="font-family:Arial,sans-serif; line-height:1.6;">
          <p>Hi ${user.username},</p>
          <p>Please verify your email address by clicking the link below:</p>
          <p><a href="${verifyUrl}" target="_blank">Verify Email</a></p>
          <p>This link expires in 24 hours.</p>
          <p>Regards,<br/>Practice Online Team</p>
        </div>
      `,
    });

    return res.json({ message: "If the email exists, a verification email has been sent." });
  } catch (err) {
    console.error("Resend verification error:", err.message);
    return res.status(500).json({ message: "Server error." });
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

    if (!user.emailVerified) {
      return res.status(403).json({
        message: "Please verify your email address before logging in.",
      });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const now = new Date();
    let effectiveStatus = user.subscriptionStatus || "none";
    let effectivePaidUntil = user.paidUntil || null;

    if (
      (!effectivePaidUntil || new Date(effectivePaidUntil) <= now) &&
      user.premium &&
      user.premiumExpiresAt &&
      new Date(user.premiumExpiresAt) > now
    ) {
      effectiveStatus = "active";
      effectivePaidUntil = user.premiumExpiresAt;
    }

    return res.json({
      message: "Login successful",
      token,
      user: {
        fullName: user.fullName || "",
        username: user.username,
        email: user.email,
        role: user.role,
        accountType: user.accountType,
        studentNumber: user.studentNumber,
        grade: user.grade,
        profileHeadline: user.profileHeadline || "",
        profilePhoto: user.profilePhoto || "",
        province: user.province || "",
        district: user.district || "",
        gender: user.gender || "",
        cellphone: user.cellphone || "",
        guardianCellphone: user.guardianCellphone || "",
        emailVerified: !!user.emailVerified,
        subscriptionStatus: effectiveStatus,
        paidUntil: effectivePaidUntil,
        lastPaymentId: user.lastPaymentId || "",
        trialActive: !!user.trialActive,
        trialStartDate: user.trialStartDate || null,
        trialEndDate: user.trialEndDate || null,
        accessStatus: user.accessStatus || "expired",
        trialDaysLeft: user.trialDaysLeft || 0,
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
});

/* ------------------ PROFILE ROUTES ------------------ */

app.get("/api/profile/me", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "fullName username email grade accountType role learnerNumber studentNumber profileHeadline profilePhoto createdAt cellphone"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      ...toPublicProfile(user),
      cellphone: user.cellphone || "",
    });
  } catch (error) {
    console.error("GET /api/profile/me error:", error.message);
    return res.status(500).json({ message: "Failed to load profile" });
  }
});

app.patch("/api/profile/me", authRequired, async (req, res) => {
  try {
    const { fullName, username, email, grade, profileHeadline } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (typeof fullName === "string") {
      user.fullName = cleanSpaces(fullName);
    }

    if (typeof username === "string") {
      const newUsername = cleanSpaces(username);
      if (!newUsername) {
        return res.status(400).json({ message: "Username is required." });
      }

      const existingUsername = await User.findOne({
        _id: { $ne: user._id },
        username: newUsername,
      }).select("_id");

      if (existingUsername) {
        return res.status(400).json({ message: "Username already in use." });
      }

      user.username = newUsername;
    }

    if (typeof email === "string") {
      const newEmail = String(email).trim().toLowerCase();

      if (!isValidEmail(newEmail)) {
        return res.status(400).json({ message: "Please enter a valid email address." });
      }

      const existingEmail = await User.findOne({
        _id: { $ne: user._id },
        email: newEmail,
      }).select("_id");

      if (existingEmail) {
        return res.status(400).json({ message: "Email already in use." });
      }

      user.email = newEmail;
    }

    if (typeof profileHeadline === "string") {
      user.profileHeadline = cleanSpaces(profileHeadline);
    }

    if (grade !== undefined && user.accountType === "student") {
      const parsedGrade = Number(grade);
      if (!Number.isInteger(parsedGrade) || parsedGrade < 8 || parsedGrade > 12) {
        return res.status(400).json({ message: "Grade must be between 8 and 12." });
      }
      user.grade = parsedGrade;
    }

    await user.save();

    return res.json({
      message: "Profile updated successfully.",
      user: toPublicProfile(user),
    });
  } catch (error) {
    console.error("PATCH /api/profile/me error:", error.message);
    return res.status(500).json({ message: "Failed to update profile" });
  }
});

app.post(
  "/api/profile/me/photo",
  authRequired,
  uploadProfilePhoto.single("photo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image uploaded." });
      }

      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.profilePhoto && user.profilePhoto.startsWith("/uploads/profile/")) {
        const oldPath = path.join(__dirname, user.profilePhoto.replace(/^\/+/, ""));
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
      console.error("POST /api/profile/me/photo error:", error.message);
      return res.status(500).json({ message: "Failed to upload profile photo" });
    }
  }
);

app.delete("/api/profile/me/photo", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.profilePhoto && user.profilePhoto.startsWith("/uploads/profile/")) {
      const oldPath = path.join(__dirname, user.profilePhoto.replace(/^\/+/, ""));
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    user.profilePhoto = "";
    await user.save();

    return res.json({ message: "Profile photo removed successfully." });
  } catch (error) {
    console.error("DELETE /api/profile/me/photo error:", error.message);
    return res.status(500).json({ message: "Failed to remove profile photo" });
  }
});

/* ------------------ ADMIN STATS ------------------ */
app.get("/api/admin/stats", authRequired, adminOnly, async (req, res) => {
  try {
    const [
      totalUsers,
      totalAssessments,
      quizzesByGradeRaw,
      learnersByGradeRaw,
      accountTypeByGradeRaw,
    ] = await Promise.all([
      User.countDocuments({}),
      Quiz.countDocuments({}),
      Quiz.aggregate([
        { $match: { grade: { $gte: 8, $lte: 12 } } },
        { $group: { _id: "$grade", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      User.aggregate([
        {
          $match: {
            accountType: "student",
            grade: { $gte: 8, $lte: 12 },
          },
        },
        { $group: { _id: "$grade", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      User.aggregate([
        {
          $match: {
            grade: { $gte: 8, $lte: 12 },
            accountType: { $in: ["student", "materials"] },
          },
        },
        {
          $group: {
            _id: { grade: "$grade", accountType: "$accountType" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const quizzesByGrade = [];
    const learnersByGrade = [];
    const accountTypeByGrade = [];

    for (let g = 8; g <= 12; g++) {
      const quizRow = quizzesByGradeRaw.find((x) => Number(x._id) === g);
      const learnerRow = learnersByGradeRaw.find((x) => Number(x._id) === g);

      const studentRow = accountTypeByGradeRaw.find(
        (x) => Number(x._id.grade) === g && x._id.accountType === "student"
      );
      const materialsRow = accountTypeByGradeRaw.find(
        (x) => Number(x._id.grade) === g && x._id.accountType === "materials"
      );

      const studentCount = studentRow ? Number(studentRow.count) : 0;
      const materialsCount = materialsRow ? Number(materialsRow.count) : 0;

      quizzesByGrade.push({
        grade: g,
        count: quizRow ? Number(quizRow.count) : 0,
      });

      learnersByGrade.push({
        grade: g,
        count: learnerRow ? Number(learnerRow.count) : 0,
      });

      accountTypeByGrade.push({
        grade: g,
        student: studentCount,
        materials: materialsCount,
        total: studentCount + materialsCount,
      });
    }

    const totalLearners = learnersByGrade.reduce((sum, row) => sum + row.count, 0);

    return res.json({
      totalUsers,
      totalAssessments,
      totalQuizzes: totalAssessments,
      totalLearners,
      quizzesByGrade,
      learnersByGrade,
      accountTypeByGrade,
    });
  } catch (e) {
    console.error("GET /api/admin/stats error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/admin/leaderboard/filters", authRequired, adminOnly, async (req, res) => {
  try {
    const [gradesRaw, provincesRaw, districtRows] = await Promise.all([
      User.distinct("grade", {
        role: "learner",
        accountType: "student",
        grade: { $ne: null },
      }),
      User.distinct("province", {
        role: "learner",
        accountType: "student",
        province: { $exists: true, $ne: "" },
      }),
      User.find(
        {
          role: "learner",
          accountType: "student",
          district: { $exists: true, $ne: "" },
        },
        "district province"
      ).lean(),
    ]);

    const grades = gradesRaw
      .map((g) => Number(g))
      .filter((g) => Number.isInteger(g))
      .sort((a, b) => a - b);

    const provinces = provincesRaw
      .map((p) => cleanSpaces(p))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const districts = districtRows
      .map((row) => ({
        name: cleanSpaces(row.district || ""),
        province: cleanSpaces(row.province || ""),
      }))
      .filter((row) => row.name)
      .sort((a, b) => {
        const p = a.province.localeCompare(b.province);
        if (p !== 0) return p;
        return a.name.localeCompare(b.name);
      });

    return res.json({
      grades,
      provinces,
      districts,
    });
  } catch (e) {
    console.error("GET /api/admin/leaderboard/filters error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/admin/leaderboard", authRequired, adminOnly, async (req, res) => {
  try {
    const period = String(req.query.period || "monthly").toLowerCase().trim();
    const grade = safeTrim(req.query.grade);
    const province = cleanSpaces(req.query.province || "");
    const district = cleanSpaces(req.query.district || "");
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

    const startDate = getPeriodStart(period);

    const resultMatch = {};
    if (startDate) {
      resultMatch.createdAt = { $gte: startDate };
    }

    const userFieldMatch = {
      "user.role": "learner",
      "user.accountType": "student",
    };

    if (grade) userFieldMatch["user.grade"] = Number(grade);
    if (province) userFieldMatch["user.province"] = province;
    if (district) userFieldMatch["user.district"] = district;

    const learnerRows = await Result.aggregate([
      { $match: resultMatch },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      { $match: userFieldMatch },
      {
        $group: {
          _id: "$user._id",
          fullName: { $first: "$user.fullName" },
          username: { $first: "$user.username" },
          province: { $first: "$user.province" },
          district: { $first: "$user.district" },
          grade: { $first: "$user.grade" },
          average: { $avg: "$percent" },
          best: { $max: "$percent" },
          quizzesCounted: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          fullName: { $ifNull: ["$fullName", ""] },
          username: { $ifNull: ["$username", ""] },
          province: { $ifNull: ["$province", ""] },
          district: { $ifNull: ["$district", ""] },
          grade: { $ifNull: ["$grade", null] },
          average: { $round: ["$average", 0] },
          best: { $round: ["$best", 0] },
          quizzesCounted: 1,
        },
      },
      { $sort: { average: -1, best: -1, quizzesCounted: -1, fullName: 1, username: 1 } },
    ]);

    const rows = learnerRows.slice(0, limit).map((row, index) => ({
      rank: index + 1,
      fullName: cleanSpaces(row.fullName || ""),
      username: cleanSpaces(row.username || ""),
      province: cleanSpaces(row.province || ""),
      district: cleanSpaces(row.district || ""),
      grade: row.grade ?? "",
      average: Number(row.average || 0),
      best: Number(row.best || 0),
      quizzesCounted: Number(row.quizzesCounted || 0),
    }));

    const learnersCounted = learnerRows.length;
    const topLearner = rows.length ? rows[0] : null;

    const provinceAgg = await Result.aggregate([
      { $match: resultMatch },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $match: {
          ...userFieldMatch,
          "user.province": { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$user.province",
          average: { $avg: "$percent" },
        },
      },
      {
        $project: {
          _id: 0,
          name: "$_id",
          average: { $round: ["$average", 0] },
        },
      },
      { $sort: { average: -1, name: 1 } },
      { $limit: 1 },
    ]);

    const districtAgg = await Result.aggregate([
      { $match: resultMatch },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $match: {
          ...userFieldMatch,
          "user.district": { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$user.district",
          average: { $avg: "$percent" },
        },
      },
      {
        $project: {
          _id: 0,
          name: "$_id",
          average: { $round: ["$average", 0] },
        },
      },
      { $sort: { average: -1, name: 1 } },
      { $limit: 1 },
    ]);

    return res.json({
      period,
      rows,
      topLearner: topLearner
        ? {
            fullName: topLearner.fullName || "",
            username: topLearner.username || "",
            province: topLearner.province || "",
            district: topLearner.district || "",
            grade: topLearner.grade ?? "",
            average: topLearner.average || 0,
            best: topLearner.best || 0,
            quizzesCounted: topLearner.quizzesCounted || 0,
          }
        : null,
      topProvince: provinceAgg[0] || null,
      topDistrict: districtAgg[0] || null,
      learnersCounted,
    });
  } catch (e) {
    console.error("GET /api/admin/leaderboard error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------ QUIZZES ------------------ */

app.get("/api/quizzes", authRequired, async (req, res) => {
  try {
    const u = await User.findById(req.user.userId).select("role grade");
    if (!u) return res.status(401).json({ message: "User not found" });

    const wantsAll = String(req.query.all || "") === "1";

    let filter = {};

    if (isPrivilegedRole(u.role) && wantsAll) {
      filter = {};
    } else if (canManageQuizzes(u.role)) {
      if (req.query.onlyPublished === "1") {
        filter.isPublished = true;
      }
    } else {
      if (!u.grade) return res.json([]);
      const now = new Date();
      filter.grade = u.grade;
      filter.isPublished = true;
      filter.$or = [{ publishAt: null }, { publishAt: { $lte: now } }];
    }

    const quizzes = await Quiz.find(filter)
      .sort({ publishedAt: 1, createdAt: 1 })
      .select(
        "grade title topic paper difficulty questions timeLimitMinutes instructions isFrozen availableFrom availableUntil createdAt updatedAt frozenAt isPublished publishedAt publishAt sendPublishEmail"
      );

    return res.json(quizzes);
  } catch (e) {
    console.error("GET /api/quizzes error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/quizzes/:id", authRequired, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Not found" });

    const u = await User.findById(req.user.userId).select("role grade");
    if (!u) return res.status(401).json({ message: "User not found" });

    if (canManageQuizzes(u.role) || isPrivilegedRole(u.role)) {
      return res.json(quiz);
    }

    if (Number(quiz.grade) !== Number(u.grade)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const now = new Date();

    if (!quiz.isPublished) {
      return res.status(403).json({ message: "This assessment is not yet published." });
    }

    if (quiz.publishAt && new Date(quiz.publishAt) > now) {
      return res.status(403).json({ message: "This assessment is not yet published." });
    }

    return res.json(quiz);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/quizzes", authRequired, quizManagerOnly, async (req, res) => {
  try {
    const {
      grade,
      title,
      topic,
      paper,
      timeLimitMinutes,
      instructions,
      questions,
      difficulty,
      publishNow,
      publishAt,
      availableFrom,
      availableUntil,
      sendPublishEmail,
    } = req.body;

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

      if (type === "note") {
        q.points = 0;
        q.correctIndex = -1;
        q.correctIndexes = [];
        q.isMultiSelect = false;
        continue;
      }

      const pts = safeInt(q?.points, 1);
      if (!Number.isInteger(pts) || pts < 1) {
        return res.status(400).json({
          message: "Each question must have marks (points) of 1 or more.",
        });
      }
      q.points = pts;

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

        q.correctIndex = -1;
        q.correctIndexes = [];
        q.isMultiSelect = false;
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
          q.correctIndex = idxs.length === 1 ? idxs[0] : -1;
        } else {
          const ci = safeInt(q?.correctIndex, null);
          if (ci === null || ci < 0 || ci >= opts.length) {
            return res.status(400).json({ message: "MCQ correctIndex must be within options." });
          }
          q.correctIndexes = [ci];
          q.correctIndex = ci;
          q.isMultiSelect = false;
        }
      }
    }

    const publishAtRaw = validDateOrNull(publishAt);
    const availableFromRaw = validDateOrNull(availableFrom);
    const availableUntilRaw = validDateOrNull(availableUntil);

    if (publishAtRaw === "INVALID") {
      return res.status(400).json({ message: "Invalid publish date/time." });
    }
    if (availableFromRaw === "INVALID") {
      return res.status(400).json({ message: "Invalid Available From date/time." });
    }
    if (availableUntilRaw === "INVALID") {
      return res.status(400).json({ message: "Invalid Available Until date/time." });
    }
    if (availableFromRaw && availableUntilRaw && availableUntilRaw <= availableFromRaw) {
      return res.status(400).json({ message: "Available Until must be after Available From." });
    }

    let isPublished = false;
    let publishedAt = null;
    let finalPublishAt = null;

    if (Boolean(publishNow)) {
      isPublished = true;
      publishedAt = new Date();
    } else if (publishAtRaw) {
      isPublished = true;
      finalPublishAt = publishAtRaw;
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
      availableFrom: availableFromRaw || null,
      availableUntil: availableUntilRaw || null,
      isPublished,
      publishedAt,
      publishAt: finalPublishAt,
      publishedBy: isPublished ? req.user.userId : null,
      sendPublishEmail: !!sendPublishEmail,
    });

    res.status(201).json({
      message: Boolean(publishNow)
        ? "Assessment published."
        : finalPublishAt
        ? "Assessment scheduled for publishing."
        : "Assessment saved as draft.",
      quizId: quiz._id,
      isPublished: quiz.isPublished,
      publishAt: quiz.publishAt,
    });

    if (Boolean(publishNow) && !!sendPublishEmail) {
      setImmediate(async () => {
        await sendPublishedQuizEmails(quiz);
      });
    }

    return;
  } catch (e) {
    console.error("POST /api/quizzes error:", e.message);
    return res.status(500).json({ message: "Could not save assessment" });
  }
});

/* ------------------ FINAL FIXED PUT ROUTE ------------------ */
app.put("/api/quizzes/:id", authRequired, quizManagerOnly, async (req, res) => {
  try {
    const id = req.params.id;

    const quiz = await Quiz.findById(id);
    if (!quiz) return res.status(404).json({ message: "Assessment not found." });

    const allowed = [
      "grade",
      "title",
      "topic",
      "paper",
      "difficulty",
      "instructions",
      "timeLimitMinutes",
      "availableFrom",
      "availableUntil",
      "questions",
      "isFrozen",
      "frozenAt",
      "isPublished",
      "publishedAt",
      "publishAt",
      "sendPublishEmail",
    ];

    for (const key of allowed) {
      if (!(key in req.body)) continue;

      if (key === "grade") {
        const g = Number(req.body.grade);
        if (!Number.isInteger(g) || g < 8 || g > 12) {
          return res.status(400).json({ message: "Grade must be between 8 and 12." });
        }
        quiz.grade = g;
        continue;
      }

      if (key === "title") {
        quiz.title = cleanSpaces(req.body.title);
        continue;
      }

      if (key === "topic") {
        quiz.topic = cleanSpaces(req.body.topic);
        continue;
      }

      if (key === "paper") {
        quiz.paper = normalizePaper(req.body.paper);
        continue;
      }

      if (key === "difficulty") {
        quiz.difficulty = normalizeDifficulty(req.body.difficulty);
        continue;
      }

      if (key === "instructions") {
        quiz.instructions = String(req.body.instructions || "").trim();
        continue;
      }

      if (key === "timeLimitMinutes") {
        const t = Number(req.body.timeLimitMinutes);
        if (!Number.isFinite(t) || t < 1 || t > 180) {
          return res.status(400).json({ message: "Time limit must be 1–180 minutes." });
        }
        quiz.timeLimitMinutes = t;
        continue;
      }

      if (key === "availableFrom") {
        if (!req.body.availableFrom) {
          quiz.availableFrom = null;
        } else {
          const d = new Date(req.body.availableFrom);
          if (isNaN(d.getTime())) {
            return res.status(400).json({ message: "Invalid Available From date/time." });
          }
          quiz.availableFrom = d;
        }
        continue;
      }

      if (key === "availableUntil") {
        if (!req.body.availableUntil) {
          quiz.availableUntil = null;
        } else {
          const d = new Date(req.body.availableUntil);
          if (isNaN(d.getTime())) {
            return res.status(400).json({ message: "Invalid Available Until date/time." });
          }
          quiz.availableUntil = d;
        }
        continue;
      }

      if (key === "isFrozen") {
        quiz.isFrozen = !!req.body.isFrozen;
        continue;
      }

      if (key === "frozenAt") {
        quiz.frozenAt = req.body.frozenAt ? new Date(req.body.frozenAt) : null;
        continue;
      }

      if (key === "isPublished") {
        quiz.isPublished = !!req.body.isPublished;
        continue;
      }

      if (key === "publishedAt") {
        quiz.publishedAt = req.body.publishedAt ? new Date(req.body.publishedAt) : null;
        continue;
      }

      if (key === "publishAt") {
        quiz.publishAt = req.body.publishAt ? new Date(req.body.publishAt) : null;
        continue;
      }

      if (key === "sendPublishEmail") {
        quiz.sendPublishEmail = !!req.body.sendPublishEmail;
        continue;
      }

      if (key === "questions") {
        if (!Array.isArray(req.body.questions) || req.body.questions.length === 0) {
          return res.status(400).json({ message: "Questions are required." });
        }

        for (const q of req.body.questions) {
          const type = String(q?.type || "mcq").toLowerCase();

          if (!cleanSpaces(q?.text)) {
            return res.status(400).json({ message: "Each block must have text." });
          }

          if ("solution" in q && q.solution !== undefined && q.solution !== null) {
            q.solution = String(q.solution);
          }

          if (type === "note") {
            q.points = 0;
            q.correctIndex = -1;
            q.correctIndexes = [];
            q.isMultiSelect = false;
            continue;
          }

          const pts = safeInt(q?.points, 1);
          if (!Number.isInteger(pts) || pts < 1) {
            return res.status(400).json({
              message: "Each question must have marks (points) of 1 or more.",
            });
          }
          q.points = pts;

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

            q.correctIndex = -1;
            q.correctIndexes = [];
            q.isMultiSelect = false;
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
              q.correctIndex = idxs.length === 1 ? idxs[0] : -1;
            } else {
              const ci = Number(q?.correctIndex);
              if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length) {
                return res.status(400).json({ message: "MCQ correctIndex must be within options." });
              }

              q.correctIndex = ci;
              q.correctIndexes = [ci];
              q.isMultiSelect = false;
            }
          }
        }

        quiz.questions = req.body.questions;
      }
    }

    if (
      quiz.availableFrom &&
      quiz.availableUntil &&
      new Date(quiz.availableUntil).getTime() <= new Date(quiz.availableFrom).getTime()
    ) {
      return res.status(400).json({ message: "Available Until must be after Available From." });
    }

    if (quiz.publishAt && isNaN(new Date(quiz.publishAt).getTime())) {
      return res.status(400).json({ message: "Invalid publish date/time." });
    }

    if (quiz.publishedAt && isNaN(new Date(quiz.publishedAt).getTime())) {
      return res.status(400).json({ message: "Invalid publishedAt date/time." });
    }

    await quiz.save();

    return res.json(quiz);
  } catch (e) {
    console.error("PUT /api/quizzes/:id error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.patch("/api/quizzes/:id/publish", authRequired, adminOnly, async (req, res) => {
  try {
    const { publishNow, publishAt, sendPublishEmail } = req.body;

    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Assessment not found." });

    const publishAtDate = validDateOrNull(publishAt);
    if (publishAtDate === "INVALID") {
      return res.status(400).json({ message: "Invalid publish date/time." });
    }

    quiz.sendPublishEmail =
      sendPublishEmail === undefined ? quiz.sendPublishEmail : !!sendPublishEmail;
    quiz.isPublished = true;
    quiz.publishedBy = req.user.userId;

    if (publishNow) {
      quiz.publishedAt = new Date();
      quiz.publishAt = null;
    } else {
      if (!publishAtDate) {
        return res.status(400).json({ message: "Publish date/time is required." });
      }
      quiz.publishAt = publishAtDate;
      quiz.publishedAt = null;
    }

    await quiz.save();

    if (publishNow && quiz.sendPublishEmail) {
      setImmediate(async () => {
        await sendPublishedQuizEmails(quiz);
      });
    }

    return res.json({
      message: publishNow
        ? "Assessment published successfully."
        : "Assessment scheduled for publishing.",
      quiz,
    });
  } catch (e) {
    console.error("PATCH /api/quizzes/:id/publish error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

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

/* ------------------ QUIZ START TIMER ------------------ */
app.post("/api/quiz/start", authRequired, async (req, res) => {
  try {
    const { quizId } = req.body;

    if (!quizId) {
      return res.status(400).json({ message: "quizId is required." });
    }

    const quiz = await Quiz.findById(quizId).select(
      "grade title topic instructions isPublished publishAt availableFrom availableUntil isFrozen timeLimitMinutes questions"
    );

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found." });
    }

    const user = await User.findById(req.user.userId).select("role grade");
    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    const canManage = canManageQuizzes(user.role) || isPrivilegedRole(user.role);

    if (!canManage) {
      if (Number(quiz.grade) !== Number(user.grade)) {
        return res.status(403).json({ message: "Not allowed." });
      }

      const now = new Date();

      if (!quiz.isPublished) {
        return res.status(403).json({ message: "This assessment is not yet published." });
      }

      if (quiz.publishAt && new Date(quiz.publishAt) > now) {
        return res.status(403).json({ message: "This assessment is not yet published." });
      }

      if (quiz.isFrozen) {
        return res.status(403).json({ message: "This assessment is not available right now." });
      }

      if (quiz.availableFrom && new Date(quiz.availableFrom) > now) {
        return res.status(403).json({ message: "This assessment is not available right now." });
      }

      if (quiz.availableUntil && new Date(quiz.availableUntil) < now) {
        return res.status(403).json({ message: "This assessment is not available right now." });
      }
    }

    const existingSubmitted = await Result.findOne({
      userId: req.user.userId,
      quizId,
      isAdminAttempt: { $ne: true },
      attemptState: { $in: ["submitted", "auto_submitted"] },
    }).sort({ createdAt: -1 });

    if (existingSubmitted && !canManage) {
      return res.status(409).json({
        message: "You already submitted this assessment.",
        alreadySubmitted: true,
      });
    }

    let existing = await Result.findOne({
      userId: req.user.userId,
      quizId,
      isAdminAttempt: false,
      attemptState: "in_progress",
    }).sort({ createdAt: -1 });

    const totalQuestions = Array.isArray(quiz.questions)
      ? quiz.questions.filter((q) => String(q.type || "mcq").toLowerCase() !== "note").length
      : 0;

    const fallbackSeconds = Math.max(5 * 60, Math.min(totalQuestions * 60, 30 * 60));
    const totalSeconds =
      Number.isFinite(Number(quiz.timeLimitMinutes)) && Number(quiz.timeLimitMinutes) > 0
        ? Number(quiz.timeLimitMinutes) * 60
        : fallbackSeconds;

    if (existing && existing.expiresAt) {
      const remainingTime = Math.max(
        0,
        Math.floor((new Date(existing.expiresAt).getTime() - Date.now()) / 1000)
      );

      return res.json({
        startedAt: existing.startedAt,
        expiresAt: existing.expiresAt,
        remainingTime,
        totalSeconds,
      });
    }

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + totalSeconds * 1000);

    existing = await Result.create({
      userId: req.user.userId,
      quizId,
      grade: quiz.grade ?? null,
      topic: quiz.topic || "General",
      title: quiz.title || "Assessment",
      instructions: quiz.instructions || "",
      score: 0,
      total: 0,
      percent: 0,
      status: "PENDING",
      answers: [],
      timeTakenSeconds: 0,
      isAdminAttempt: false,
      attemptNo: 1,
      attemptedAt: startedAt,
      startedAt,
      expiresAt,
      submittedAt: null,
      attemptState: "in_progress",
    });

    return res.json({
      startedAt,
      expiresAt,
      remainingTime: totalSeconds,
      totalSeconds,
    });
  } catch (error) {
    console.error("POST /api/quiz/start error:", error.message);
    return res.status(500).json({ message: "Failed to start quiz." });
  }
});

/* ------------------ RESULTS ------------------ */

app.get("/api/results/my", authRequired, async (req, res) => {
  try {
    const results = await Result.find({
      userId: req.user.userId,
      attemptState: { $in: ["submitted", "auto_submitted"] },
    }).sort({ attemptedAt: -1, createdAt: -1 });

    return res.json(results);
  } catch (e) {
    console.error("GET /api/results/my error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/results/:id", authRequired, async (req, res) => {
  try {
    const result = await Result.findById(req.params.id);
    if (!result) return res.status(404).json({ message: "Not found" });

    if (String(result.userId) !== String(req.user.userId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    return res.json(result);
  } catch (e) {
    console.error("GET /api/results/:id error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/results", authRequired, async (req, res) => {
  try {
    const { quizId, answers = [], timeTakenSeconds = 0 } = req.body;

    if (!quizId || !Array.isArray(answers)) {
      return res.status(400).json({ message: "quizId and answers are required." });
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found." });
    }

    const user = await User.findById(req.user.userId).select("role grade");
    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    const canManage = canManageQuizzes(user.role) || isPrivilegedRole(user.role);

    let existingResult = await Result.findOne({
      userId: req.user.userId,
      quizId,
      isAdminAttempt: false,
      attemptState: "in_progress",
    }).sort({ createdAt: -1 });

    if (!existingResult && !canManage) {
      const alreadySubmitted = await Result.findOne({
        userId: req.user.userId,
        quizId,
        isAdminAttempt: { $ne: true },
        attemptState: { $in: ["submitted", "auto_submitted"] },
      }).select("_id");

      if (alreadySubmitted) {
        return res.status(409).json({ message: "You already submitted this assessment." });
      }
    }

    if (existingResult?.expiresAt && new Date() > new Date(existingResult.expiresAt)) {
      existingResult.attemptState = "auto_submitted";
      existingResult.submittedAt = existingResult.expiresAt;
    }

    const byQuestionIndex = new Map();
    for (const a of answers) {
      const qi = Number(a?.questionIndex);
      if (Number.isInteger(qi) && qi >= 0) {
        byQuestionIndex.set(qi, a);
      }
    }

    const scoredAnswers = [];
    let score = 0;
    let total = 0;

    for (let i = 0; i < quiz.questions.length; i++) {
      const q = quiz.questions[i];
      const type = String(q?.type || "mcq").toLowerCase();

      if (type === "note") {
        continue;
      }

      const incoming = byQuestionIndex.get(i) || {};
      const points = Number(q.points || 0);
      total += points;

      let earnedPoints = 0;
      let isCorrect = false;

      const base = {
        questionIndex: i,
        type,
        points,
        earnedPoints: 0,
        chosenIndex: -1,
        correctIndex: -1,
        isMultiSelect: false,
        chosenIndexes: [],
        correctIndexes: [],
        textAnswer: "",
        correctText: "",
        hint: String(q.hint || ""),
        solution: String(q.solution || ""),
        answerMode: "case-insensitive",
        roundTo: null,
        tolerance: null,
        isCorrect: false,
        questionText: String(q.text || ""),
        options: Array.isArray(q.options) ? q.options : [],
      };

      if (type === "text") {
        const userText = cleanSpaces(incoming.textAnswer || "");
        const correctText = cleanSpaces(q.correctText || "");
        const mode = String(q.textAnswerMode || "exact");
        const tolerance = q.numberTolerance ?? null;

        if (mode === "number_tolerance") {
          const userNum = Number(userText);
          const correctNum = Number(correctText);
          const tol = Number(tolerance ?? 0);
          if (
            Number.isFinite(userNum) &&
            Number.isFinite(correctNum) &&
            Number.isFinite(tol)
          ) {
            isCorrect = Math.abs(userNum - correctNum) <= tol;
          }
        } else if (mode === "contains") {
          isCorrect =
            userText.toLowerCase().includes(correctText.toLowerCase()) && !!correctText;
        } else {
          isCorrect = userText.toLowerCase() === correctText.toLowerCase() && !!correctText;
        }

        earnedPoints = isCorrect ? points : 0;
        score += earnedPoints;

        scoredAnswers.push({
          ...base,
          earnedPoints,
          textAnswer: userText,
          correctText,
          answerMode:
            mode === "number_tolerance"
              ? "number"
              : mode === "contains"
              ? "case-insensitive"
              : "exact",
          tolerance: tolerance ?? null,
          isCorrect,
        });
      } else {
        const opts = Array.isArray(q.options) ? q.options : [];
        const correctIndexes = normalizeIndexArray(
          Array.isArray(q.correctIndexes) && q.correctIndexes.length
            ? q.correctIndexes
            : Number.isInteger(Number(q.correctIndex))
            ? [Number(q.correctIndex)]
            : []
        );

        const chosenIndexes = normalizeIndexArray(
          Array.isArray(incoming.chosenIndexes) && incoming.chosenIndexes.length
            ? incoming.chosenIndexes
            : Number.isInteger(Number(incoming.chosenIndex))
            ? [Number(incoming.chosenIndex)]
            : []
        );

        const isMultiSelect = Boolean(q.isMultiSelect) || correctIndexes.length >= 2;

        if (isMultiSelect) {
          isCorrect = isMultiMcqCorrect(chosenIndexes, correctIndexes);
        } else {
          isCorrect =
            chosenIndexes.length === 1 &&
            correctIndexes.length === 1 &&
            chosenIndexes[0] === correctIndexes[0];
        }

        earnedPoints = isCorrect ? points : 0;
        score += earnedPoints;

        scoredAnswers.push({
          ...base,
          earnedPoints,
          chosenIndex: chosenIndexes.length === 1 ? chosenIndexes[0] : -1,
          correctIndex: correctIndexes.length === 1 ? correctIndexes[0] : -1,
          isMultiSelect,
          chosenIndexes,
          correctIndexes,
          options: opts,
          isCorrect,
        });
      }
    }

    const percent = total > 0 ? Math.round((score / total) * 100) : 0;
    const status = percent >= 50 ? "PASS" : "FAIL";

    if (existingResult) {
      existingResult.score = score;
      existingResult.total = total;
      existingResult.percent = percent;
      existingResult.status = status;
      existingResult.answers = scoredAnswers;
      existingResult.timeTakenSeconds = Number(timeTakenSeconds || 0);
      existingResult.startedAt = existingResult.startedAt || new Date();
      existingResult.submittedAt = new Date();
      existingResult.attemptState =
        new Date() > new Date(existingResult.expiresAt || new Date())
          ? "auto_submitted"
          : "submitted";
      existingResult.attemptedAt = existingResult.submittedAt;
      await existingResult.save();

      return res.status(201).json(existingResult);
    }

    const saved = await Result.create({
      userId: req.user.userId,
      quizId,
      grade: quiz.grade ?? null,
      topic: quiz.topic || "General",
      title: quiz.title || "Assessment",
      instructions: quiz.instructions || "",
      score,
      total,
      percent,
      status,
      answers: scoredAnswers,
      timeTakenSeconds: Number(timeTakenSeconds || 0),
      isAdminAttempt: false,
      attemptNo: 1,
      attemptedAt: new Date(),
      startedAt: new Date(),
      expiresAt: null,
      submittedAt: new Date(),
      attemptState: "submitted",
    });

    return res.status(201).json(saved);
  } catch (e) {
    console.error("POST /api/results error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------ ANNOUNCEMENTS ------------------ */

app.post("/api/announcements", authRequired, quizManagerOnly, async (req, res) => {
  try {
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

    if (!cleanSpaces(title) || !cleanSpaces(message)) {
      return res.status(400).json({ message: "Title and message are required." });
    }

    const announcement = await Announcement.create({
      title: cleanSpaces(title),
      message: cleanSpaces(message),
      grade: normalizeAnnouncementGrade(grade),
      category: normalizeAnnouncementCategory(category),
      isPublished: isPublished !== false,
      sendToStudents: !!sendToStudents,
      urgentNotice: !!urgentNotice,
      meetingLink: cleanSpaces(meetingLink || ""),
      meetingDate: cleanSpaces(meetingDate || ""),
      meetingTime: cleanSpaces(meetingTime || ""),
      dueDate: cleanSpaces(dueDate || ""),
      quizStatus: cleanSpaces(quizStatus || "Open"),
      createdBy: req.user.userId,
    });

    return res.status(201).json(announcement);
  } catch (e) {
    console.error("POST /api/announcements error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/announcements", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("role grade");
    if (!user) return res.status(404).json({ message: "User not found" });

    const isManager = canManageQuizzes(user.role) || isPrivilegedRole(user.role);

    let filter = {};
    if (!isManager) {
      const learnerGrade = gradeToAnnouncementGrade(user.grade);
      filter = {
        isPublished: true,
        $or: [{ grade: "allGrades" }, { grade: learnerGrade }],
      };
    }

    const rows = await Announcement.find(filter).sort({ urgentNotice: -1, createdAt: -1 });

    if (isManager) {
      return res.json(rows);
    }

    return res.json(rows.map((a) => stripAnnouncementForUser(a, req.user.userId)));
  } catch (e) {
    console.error("GET /api/announcements error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/announcements/admin/list", authRequired, quizManagerOnly, async (req, res) => {
  try {
    const rows = await Announcement.find({}).sort({ createdAt: -1 });
    return res.json(rows);
  } catch (e) {
    console.error("GET /api/announcements/admin/list error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/announcements/:id", authRequired, quizManagerOnly, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ message: "Announcement not found" });

    const fields = [
      "title",
      "message",
      "grade",
      "category",
      "meetingLink",
      "meetingDate",
      "meetingTime",
      "dueDate",
      "quizStatus",
    ];

    for (const key of fields) {
      if (key in req.body) {
        if (key === "grade") announcement.grade = normalizeAnnouncementGrade(req.body.grade);
        else if (key === "category")
          announcement.category = normalizeAnnouncementCategory(req.body.category);
        else announcement[key] = cleanSpaces(req.body[key] || "");
      }
    }

    if ("isPublished" in req.body) announcement.isPublished = !!req.body.isPublished;
    if ("sendToStudents" in req.body) announcement.sendToStudents = !!req.body.sendToStudents;
    if ("urgentNotice" in req.body) announcement.urgentNotice = !!req.body.urgentNotice;

    await announcement.save();
    return res.json(announcement);
  } catch (e) {
    console.error("PUT /api/announcements/:id error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.delete("/api/announcements/:id", authRequired, quizManagerOnly, async (req, res) => {
  try {
    const deleted = await Announcement.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Announcement not found" });
    return res.json({ message: "Deleted" });
  } catch (e) {
    console.error("DELETE /api/announcements/:id error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/announcements/respond/:id", authRequired, async (req, res) => {
  try {
    const { response } = req.body;
    if (!["accepted", "rejected"].includes(String(response || "").toLowerCase())) {
      return res.status(400).json({ message: "Invalid response" });
    }

    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ message: "Announcement not found" });

    const existing = announcement.responses.find(
      (r) => String(r.student) === String(req.user.userId)
    );

    if (existing) {
      existing.response = String(response).toLowerCase();
      existing.respondedAt = new Date();
    } else {
      announcement.responses.push({
        student: req.user.userId,
        response: String(response).toLowerCase(),
        respondedAt: new Date(),
      });
    }

    await announcement.save();
    return res.json({
      message: "Response saved",
      learnerResponse: String(response).toLowerCase(),
    });
  } catch (e) {
    console.error("POST /api/announcements/respond/:id error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/announcements/mark-seen", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.lastSeenAnnouncementsAt = new Date();
    await user.save();

    return res.json({ message: "Announcements marked as seen." });
  } catch (e) {
    console.error("POST /api/announcements/mark-seen error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/announcements/profile-summary", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("grade lastSeenAnnouncementsAt");
    if (!user) return res.status(404).json({ message: "User not found" });

    const learnerGrade = gradeToAnnouncementGrade(user.grade);

    const announcements = await Announcement.find({
      isPublished: true,
      $or: [{ grade: "allGrades" }, { grade: learnerGrade }],
    })
      .sort({ urgentNotice: -1, createdAt: -1 })
      .limit(50);

    const latest = announcements.length ? announcements[0] : null;

    const unreadCount = announcements.filter((a) => {
      if (!user.lastSeenAnnouncementsAt) return true;
      return new Date(a.createdAt) > new Date(user.lastSeenAnnouncementsAt);
    }).length;

    return res.json({
      count: unreadCount,
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
  } catch (e) {
    console.error("GET /api/announcements/profile-summary error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------ ACCESS / PAYMENTS ROUTES ------------------ */
app.use("/api/access", accessRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/manual-payments", manualPaymentsRoutes);

/* ------------------ PASSWORD RESET ------------------ */
app.post("/api/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({
        message: "If the email exists, a reset link has been sent.",
      });
    }

    const rawOtp = makeOtp6();
    user.resetOtpHash = hashToken(rawOtp);
    user.resetOtpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await sendEmail({
      to: user.email,
      subject: "Practice Online password reset OTP",
      text: `Your OTP is ${rawOtp}. It expires in 15 minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <p>Hello ${user.username || "User"},</p>
          <p>Your password reset OTP is:</p>
          <p style="font-size:24px;font-weight:700">${rawOtp}</p>
          <p>This OTP expires in 15 minutes.</p>
        </div>
      `,
    });

    return res.json({
      message: "If the email exists, a reset link has been sent.",
    });
  } catch (e) {
    console.error("POST /api/forgot-password error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/reset-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP and new password are required." });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid request." });

    if (
      !user.resetOtpHash ||
      !user.resetOtpExpiresAt ||
      user.resetOtpExpiresAt < new Date() ||
      user.resetOtpHash !== hashToken(otp)
    ) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetOtpHash = "";
    user.resetOtpExpiresAt = null;
    await user.save();

    return res.json({ message: "Password reset successfully." });
  } catch (e) {
    console.error("POST /api/reset-password error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------ SUPPORT ------------------ */
const SupportRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    subject: { type: String, default: "Maths", trim: true },
    requestType: { type: String, default: "", trim: true },
    requestFollowUp: { type: String, default: "", trim: true },
    changeAccount: {
      currentAccountType: { type: String, default: "", trim: true },
      newAccountType: { type: String, default: "", trim: true },
    },
    message: { type: String, required: true, trim: true },
    contact: { type: String, default: "", trim: true },
    status: { type: String, default: "pending", trim: true },
  },
  { timestamps: true }
);

const SupportRequest =
  mongoose.models.SupportRequest || mongoose.model("SupportRequest", SupportRequestSchema);

app.post("/api/support", authRequired, async (req, res) => {
  try {
    const support = await SupportRequest.create({
      userId: req.user.userId,
      subject: cleanSpaces(req.body.subject || "Maths"),
      requestType: cleanSpaces(req.body.requestType || ""),
      requestFollowUp: cleanSpaces(req.body.requestFollowUp || ""),
      changeAccount: req.body.changeAccount || null,
      message: cleanSpaces(req.body.message || ""),
      contact: cleanSpaces(req.body.contact || ""),
      status: "pending",
    });

    return res.status(201).json({
      message: "Support request submitted successfully.",
      support,
    });
  } catch (e) {
    console.error("POST /api/support error:", e.message);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ------------------ MOUNT OTHER ROUTES ------------------ */
app.use("/api/access", accessRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/manual-payments", manualPaymentsRoutes);

/* ------------------ DB + SERVER ------------------ */
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error("Missing MONGO_URI / MONGODB_URI in environment.");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");

    await autoPublishScheduledQuizzes();
    setInterval(autoPublishScheduledQuizzes, 60 * 1000);

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });
