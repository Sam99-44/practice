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
// ✅ NEW: Saves + returns quiz paper (paper1/paper2)
// ✅ NEW: PayFast monthly payments
// ✅ NEW: Returns subscription info on /api/auth/me
// ✅ NEW: Strong email validation
// ✅ NEW: Email verification routes
// ✅ NEW: Login blocks unverified users
// ✅ NEW: Register route protection with express-rate-limit.
// ✅ NEW: Free trial system
// ✅ NEW: Access-status routes
// ✅ NEW: Trial expiry blocks protected learner routes

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
import { addDays } from "./utils/access.js";
import { requireActiveAccess } from "./middleware/requireActiveAccess.js";

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

function makeVerifyToken() {
  return crypto.randomBytes(32).toString("hex");
}

function isValidEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
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

// ✅ NEW: normalize paper
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

// ✅ FIXED: no sorting, trims values, matches posted field order
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
    if (u.role !== "admin") return res.status(403).json({ message: "Admin only" });
    next();
  } catch {
    res.status(500).json({ message: "Server error" });
  }
}

/* ------------------ AUTH ROUTES ------------------ */

app.get("/api/auth/me", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "username email role grade accountType studentNumber province district gender cellphone guardianCellphone emailVerified subscriptionStatus paidUntil lastPaymentId premium premiumExpiresAt trialActive trialStartDate trialEndDate trialExpiredAt accessStatus trialDaysLeft"
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
      fullName,
      username,
      email,
      grade,
      password,
      accountType,
      province,
      district,
      gender,
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

    const passwordHash = await bcrypt.hash(password, 10);
    const studentNumber =
      accountType === "student" ? await generateStudentNumber8() : null;

    const rawVerifyToken = makeVerifyToken();
    const verifyTokenHash = hashToken(rawVerifyToken);
    const verifyTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const now = new Date();
    const trialDays = 7;

    const user = await User.create({
      fullName: cleanSpaces(fullName || ""),
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      role: "learner",
      accountType,
      studentNumber,
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

    if (user.accountType === "student") {
      await sendEmail({
        to: user.email,
        subject: "Verify your Practice Online email",
        text: `Hi ${user.username}, your student number is ${user.studentNumber}. Verify your email here: ${verifyUrl}`,
        html: `
          <div style="font-family:Arial,sans-serif; line-height:1.6;">
            <p>Hi ${user.username},</p>
            <p>Welcome to Practice Online.</p>
            <p>Your student number is: <b>${user.studentNumber}</b></p>
            <p>Please verify your email address by clicking the link below:</p>
            <p><a href="${verifyUrl}" target="_blank">Verify Email</a></p>
            <p>This link expires in 24 hours.</p>
            <p>Regards,<br/>Practice Online Team</p>
          </div>
        `,
      });
    } else {
      await sendEmail({
        to: user.email,
        subject: "Verify your Practice Online email",
        text: `Hi ${user.username}, your account is ready. Verify your email here: ${verifyUrl}`,
        html: `
          <div style="font-family:Arial,sans-serif; line-height:1.6;">
            <p>Hi ${user.username},</p>
            <p>Welcome to Practice Online.</p>
            <p>Your account is ready and you have access to learning materials.</p>
            <p>Please verify your email address by clicking the link below:</p>
            <p><a href="${verifyUrl}" target="_blank">Verify Email</a></p>
            <p>This link expires in 24 hours.</p>
            <p>Regards,<br/>Practice Online Team</p>
          </div>
        `,
      });
    }

    return res.status(201).json({
      message: "Account created. Please verify your email before logging in.",
      accountType: user.accountType,
      studentNumber: user.studentNumber,
    });
  } catch (err) {
    console.error("Register error:", err.message);
    return res.status(500).json({ message: "Server error. Please try again." });
  }
});

// VERIFY EMAIL
app.post("/api/verify-email", async (req, res) => {
  try {
    const { email, token } = req.body;

    if (!email || !token) {
      return res.status(400).json({ message: "Email and token are required." });
    }

    const cleanEmail = String(email || "").trim().toLowerCase();
    const tokenHash = hashToken(String(token || "").trim());

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired verification link." });
    }

    const isExpired =
      !user.verifyTokenExpiresAt || user.verifyTokenExpiresAt.getTime() < Date.now();

    const isMatch =
      user.verifyTokenHash && String(user.verifyTokenHash) === String(tokenHash);

    if (!isMatch || isExpired) {
      return res.status(400).json({ message: "Invalid or expired verification link." });
    }

    user.emailVerified = true;
    user.verifyTokenHash = null;
    user.verifyTokenExpiresAt = null;
    await user.save();

    return res.json({ message: "Email verified successfully. You can login now." });
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
      "fullName username email grade accountType role learnerNumber studentNumber profileHeadline profilePhoto createdAt"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(toPublicProfile(user));
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

app.get("/api/quizzes", authRequired, requireActiveAccess, async (req, res) => {
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

app.get("/api/quizzes/:id", authRequired, requireActiveAccess, async (req, res) => {
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
          emailVerified: true,
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

app.post("/api/results", authRequired, requireActiveAccess, async (req, res) => {
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
      const qPoints = type === "note" ? 0 : Number(q.points) || 1;
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

app.get("/api/results/my", authRequired, requireActiveAccess, async (req, res) => {
  try {
    const userId = req.user.userId;

    const rows = await Result.find({ userId })
      .sort({ createdAt: -1 })
      .select(
        "_id createdAt grade topic title paper percent score total status quizId attemptNo isAdminAttempt"
      );

    return res.json(rows);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/results/:id", authRequired, requireActiveAccess, async (req, res) => {
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
    const isExpired =
      !user.resetPasswordExpires || user.resetPasswordExpires.getTime() < Date.now();
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

    const currentUser = await User.findById(req.user.userId).select("email role accountType");
    if (!currentUser) {
      return res.status(401).json({ message: "User not found." });
    }

    if (currentUser.role === "admin") {
      return res.status(400).json({ message: "Admins do not need a subscription." });
    }

    if (currentUser.accountType !== "student") {
      return res.status(400).json({ message: "This payment is only for student subscriptions." });
    }

    const m_payment_id = `M-${req.user.userId}-${Date.now()}`;

    await Payment.create({
      userId: req.user.userId,
      m_payment_id,
      plan: "monthly",
      amount: amt,
      status: "PENDING",
    });

    const emailPrefix = currentUser.email ? currentUser.email.split("@")[0] : "Practice";

    const data = {
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: `${APP_URL}/payment-success.html`,
      cancel_url: `${APP_URL}/payment-cancel.html`,
      notify_url: `${API_URL}/api/payfast/itn`,
      m_payment_id: String(m_payment_id).trim(),
      amount: amt.toFixed(2),
      item_name: String(item_name || "Practice Online Subscription (30 days)")
        .trim()
        .slice(0, 100),
      name_first: String(emailPrefix || "Practice").trim(),
      name_last: "Online",
      email_address: String(
        currentUser.email || FROM_EMAIL || "no-reply@practiceonline.co.za"
      ).trim(),
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

app.post("/api/payfast/itn", async (req, res) => {
  try {
    const pfData = { ...req.body };

    console.log("PayFast ITN received:", pfData);

    if (!pfData || !pfData.m_payment_id) {
      return res.status(400).send("Missing ITN data");
    }

    const receivedSignature = String(pfData.signature || "").trim();
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
        "paidUntil subscriptionStatus lastPaymentId premium premiumActivatedAt premiumExpiresAt trialActive"
      );

      if (user) {
        const now = new Date();
        const base =
          user.paidUntil && new Date(user.paidUntil) > now ? new Date(user.paidUntil) : now;

        const newUntil = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

        user.paidUntil = newUntil;
        user.subscriptionStatus = "active";
        user.lastPaymentId = payment.m_payment_id;
        user.premium = true;
        user.premiumActivatedAt = now;
        user.premiumExpiresAt = newUntil;
        user.trialActive = false;

        await user.save();
      }
    }

    return res.status(200).send("OK");
  } catch (e) {
    console.error("POST /api/payfast/itn error:", e.message);
    return res.status(500).send("Server error");
  }
});

/* ------------------ ACCESS + PAYMENT ROUTES ------------------ */
app.use("/api/access", accessRoutes);
app.use("/api/payments", paymentRoutes);

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
✅ ALSO UPDATE models/User.js with these fields:

trialActive: {
  type: Boolean,
  default: true,
},

trialStartDate: {
  type: Date,
  default: null,
},

trialEndDate: {
  type: Date,
  default: null,
},

trialExpiredAt: {
  type: Date,
  default: null,
},

✅ Profile routes added:
GET    /api/profile/me
PATCH  /api/profile/me
POST   /api/profile/me/photo
DELETE /api/profile/me/photo

✅ Free trial routes mounted:
GET    /api/access/me/access-status
POST   /api/payments/activate-paid-access
*/
