// server.js (FULL UPDATED - COPY & PASTE)
// ✅ Adds profile routes
// ✅ Adds profile photo upload/remove
// ✅ Adds profile info update
// ✅ Adds static /uploads serving
// ✅ Keeps current studentNumber system
// ✅ Adds MCQ MULTI-SELECT support (chosenIndexes + correctIndexes)
// ✅ Auto-detects multi-select when correctIndexes has 2+ items OR isMultiSelect true
// ✅ Saves multi-select properly into Result for review/results
// ✅ Saves and marks single + multiple typed-answer fields
// ✅ Supports instructions, labels, units, x/y/z values and review snapshots
// ✅ Backward compatible with old single-correct fields (chosenIndex/correctIndex)
// ✅ Saves + returns quiz difficulty (easy/moderate/hard)
// ✅ Saves + returns quiz paper (paper1/paper2)
// ✅ PayFast monthly payments
// ✅ Returns subscription info on /api/auth/me
// ✅ Strong email validation.
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
// ✅  system added
// ✅ Profile  summary added.
// ✅ Class RSVP (accept/reject) added.

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";

import Quiz from "./models/Quiz.js";
import User from "./models/User.js";
import Result from "./models/Result.js";
import Payment from "./models/Payment.js";

import accessRoutes from "./routes/access.js";
import opportunitiesRoutes from "./routes/opportunities.js";
import paymentRoutes from "./routes/payments.js";
import manualPaymentsRoutes from "./routes/manualPayments.js";
import enrollmentRoutes from "./routes/enrollments.js";
import { addDays } from "./utils/access.js";
import employeesRoutes from "./routes/employees.js";
import tutorRoutes from "./routes/tutors.js";
import supportRoutes from "./routes/support.js";
import requestQuoteRoutes from "./routes/requestQuote.js";
import Employee from "./models/Employee.js";
import tasksRoutes from "./routes/tasks.js";

import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";

dotenv.config();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const app = express();
app.use(passport.initialize());

passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: "https://api.practiceonline.co.za/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();

        if (!email) {
          return done(new Error("Google account has no email"), null);
        }

        let user = await User.findOne({ email });

        if (!user) {
          const learnerNumber = await generateUniqueLearnerNumber("learner");

          user = await User.create({
            fullName: profile.displayName || email.split("@")[0],
            username: email.split("@")[0],
            email,
            emailVerified: true,
            role: "learner",
            accountType: "learner",
            learnerNumber,
            studentNumber: null,
            profilePhoto: profile.photos?.[0]?.value || "",
            trialActive: true,
            trialStartDate: new Date(),
            trialEndDate: addDays(new Date(), 7),
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

/* ---------- SECURITY ---------- */
app.use(helmet());
app.use(mongoSanitize());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many requests. Please try again later."
  }
});

app.use(globalLimiter);

/* ---------- BODY PARSER ---------- */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsRoot = path.join(__dirname, "uploads");
const profileUploadDir = path.join(uploadsRoot, "profile");
fs.mkdirSync(profileUploadDir, { recursive: true });

app.use("/uploads", express.static(uploadsRoot));

/* ------------------ BREVO ------------------ */
const BREVO_API_KEY = (process.env.BREVO_API_KEY || "").trim();
const BREVO_SENDER_EMAIL = (process.env.BREVO_SENDER_EMAIL || "").trim();
const BREVO_SENDER_NAME = (process.env.BREVO_SENDER_NAME || "Practice Online").trim();

async function sendEmail({ to, subject, html, text }) {
  if (!BREVO_API_KEY) throw new Error("Missing BREVO_API_KEY on server");
  if (!BREVO_SENDER_EMAIL) throw new Error("Missing BREVO_SENDER_EMAIL on server");
  if (!to) throw new Error("Recipient email is required");

  const payload = {
    sender: {
      email: BREVO_SENDER_EMAIL,
      name: BREVO_SENDER_NAME,
    },
    to: [{ email: String(to).trim() }],
    subject: String(subject || "").trim(),
    htmlContent: html || undefined,
    textContent: text || undefined,
  };

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Brevo send failed:", data);
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }

  return data;
}

async function sendBulkEmail({ recipients, subject, html, text }) {
  if (!BREVO_API_KEY) throw new Error("Missing BREVO_API_KEY on server");
  if (!BREVO_SENDER_EMAIL) throw new Error("Missing BREVO_SENDER_EMAIL on server");
  if (!Array.isArray(recipients) || recipients.length === 0) return;

  const cleanRecipients = recipients
    .map((email) => String(email || "").trim())
    .filter(Boolean)
    .map((email) => ({ email }));

  if (!cleanRecipients.length) return;

  const payload = {
    sender: {
      email: BREVO_SENDER_EMAIL,
      name: BREVO_SENDER_NAME,
    },
    to: cleanRecipients,
    subject: String(subject || "").trim(),
    htmlContent: html || undefined,
    textContent: text || undefined,
  };

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Brevo bulk send failed:", data);
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }

  return data;
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

async function generateStudentNumber8() {
  while (true) {
    const num = String(Math.floor(10000000 + Math.random() * 90000000));
    const exists = await User.findOne({ studentNumber: num }).select("_id");
    if (!exists) return num;
  }
}

async function generateUniqueLearnerNumber(accountType) {
  const year = new Date().getFullYear().toString().slice(-2);

  let learnerNumber;
  let exists = true;

  while (exists) {
    const random = Math.floor(10000 + Math.random() * 90000);

    learnerNumber =
      accountType === "learner"
        ? "PO" + year + random
        : "P" + year + random;

    const found = await User.findOne({ learnerNumber }).select("_id");
    if (!found) exists = false;
  }

  return learnerNumber;
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
function normalizeQuizAccessLevel(value) {
  return String(value || "").toLowerCase().trim() === "premium"
    ? "premium"
    : "standard";
}

async function generateAssessmentCode(grade, paper) {
  const gradePart = grade ? String(grade) : "ALL";
  const paperPart = normalizePaper(paper) === "paper2" ? "P2" : "P1";
  const prefix = `MAT${gradePart}-${paperPart}`;

  const latestQuiz = await Quiz.findOne({
    assessmentCode: { $regex: `^${prefix}-` },
  })
    .sort({ assessmentCode: -1 })
    .select("assessmentCode")
    .lean();

  let nextNumber = 1;

  if (latestQuiz?.assessmentCode) {
    const currentNumber = Number(
      latestQuiz.assessmentCode.split("-").pop()
    );

    if (Number.isInteger(currentNumber)) {
      nextNumber = currentNumber + 1;
    }
  }

  return `${prefix}-${String(nextNumber).padStart(4, "0")}`;
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
/* ------------------ RATE LIMIT ------------------ */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Please try again later.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
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
      subject: "Brevo test",
      text: "Email sending works.",
      html: "<strong>Email sending works.</strong>",
    });
    res.send("Email sent successfully to " + to);
  } catch (err) {
    console.error("Brevo test email failed:", err.message);
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
    if (!u) return res.status(401).json({ message: "User " });

    if (!isPrivilegedRole(u.role)) {
      return res.status(403).json({ message: "Admin/tester only" });
    }

    next();
  } catch {
    res.status(500).json({ message: "Server error" });
  }
}
async function employeeAdminOnly(req, res, next) {
  try {
    const employee = await Employee.findById(req.user.userId).select("role");

    if (!employee) {
      return res.status(401).json({
        message: "Employee not found."
      });
    }

    const role = String(employee.role || "").toLowerCase();

    if (!["admin", "tester"].includes(role)) {
      return res.status(403).json({
        message: "Only admin can edit or remove potential clients."
      });
    }

    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error."
    });
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
/* ------------------ POTENTIAL CLIENTS ------------------ */

app.get(
  "/api/finance/potential-clients",
  authRequired,
  async (req, res) => {
    try {
      const users = await User.find({
        role: "learner"
      })
        .select(
          "_id fullName username email cellphone guardianCellphone grade province district accountType learnerNumber createdAt emailVerified"
        )
        .sort({ createdAt: -1 })
        .lean();

      return res.json(users);
    } catch (error) {
      console.error(
        "GET /api/finance/potential-clients error:",
        error
      );

      return res.status(500).json({
        message: "Could not load potential clients."
      });
    }
  }
);

app.patch("/api/finance/potential-clients/:id", authRequired, employeeAdminOnly, async (req, res) => {
  try {
    const allowedUpdates = {};

    const fields = [
      "fullName",
      "username",
      "email",
      "cellphone",
      "guardianCellphone",
      "grade",
      "schoolName",
      "currentMarkRange",
      "province",
      "district",
      "accountType"
    ];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        allowedUpdates[field] = req.body[field];
      }
    });

    if (allowedUpdates.email) {
      allowedUpdates.email = String(allowedUpdates.email).trim().toLowerCase();
    }

    if (allowedUpdates.grade !== undefined && allowedUpdates.grade !== "") {
      allowedUpdates.grade = Number(allowedUpdates.grade);
    }

    const user = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        role: "learner",
      },
      { $set: allowedUpdates },
      {
        new: true,
        runValidators: true,
      }
    ).select(
      "fullName username email cellphone guardianCellphone grade schoolName currentMarkRange province district accountType learnerNumber createdAt"
    );

    if (!user) {
      return res.status(404).json({
        message: "Potential client not found.",
      });
    }

    return res.json({
      message: "Potential client updated successfully.",
      user,
    });
  } catch (error) {
    console.error("PATCH /api/finance/potential-clients/:id error:", error);

    return res.status(500).json({
      message: "Could not update potential client.",
    });
  }
});

app.delete("/api/finance/potential-clients/:id", authRequired, employeeAdminOnly, async (req, res) => {
  try {
    const user = await User.findOneAndDelete({
      _id: req.params.id,
      role: "learner",
    });

    if (!user) {
      return res.status(404).json({
        message: "Potential client not found.",
      });
    }

    return res.json({
      message: "Potential client removed successfully.",
    });
  } catch (error) {
    console.error("DELETE /api/finance/potential-clients/:id error:", error);

    return res.status(500).json({
      message: "Could not remove potential client.",
    });
  }
});
/* ------------------ LEARNER RESULTS ------------------ */

app.get("/api/admin/learner-results", authRequired, async (req, res) => {
  try {
    const results = await Result.find({})
      .populate(
        "userId",
        "fullName username email learnerNumber grade province district cellphone guardianCellphone accountType"
      )
      .populate(
        "quizId",
        "title topic grade paper difficulty"
      )
      .sort({ attemptedAt: -1, createdAt: -1 })
      .lean();

    const rows = results.map((result) => {
      const learner = result.userId || {};
      const quiz = result.quizId || {};

      return {
        _id: result._id,

        learnerName: learner.fullName || learner.username || "",
        username: learner.username || "",
        email: learner.email || "",
        learnerNumber: learner.learnerNumber || "",
        cellphone: learner.cellphone || "",
        guardianCellphone: learner.guardianCellphone || "",

        grade: learner.grade || result.grade || quiz.grade || "",
        province: learner.province || "",
        district: learner.district || "",

        quizTitle: result.title || quiz.title || "Assessment",
        topic: result.topic || quiz.topic || "General",
        paper: quiz.paper || "",
        difficulty: quiz.difficulty || "",

        score: result.score || 0,
        total: result.total || 0,
        percent: result.percent || 0,
        status: result.status || "",

        timeTakenSeconds: result.timeTakenSeconds || 0,
        attemptNo: result.attemptNo || 1,
        isAdminAttempt: !!result.isAdminAttempt,

        submittedAt: result.attemptedAt || result.createdAt,
        assessmentCode: quiz.assessmentCode || "",
        accessLevel: quiz.accessLevel || "standard",
      };
    });

    return res.json(rows);
  } catch (error) {
    console.error("GET /api/admin/learner-results error:", error);

    return res.status(500).json({
      message: "Could not load learner results.",
    });
  }
});
app.patch("/api/admin/learner-results/:id", authRequired, employeeAdminOnly, async (req, res) => {
  try {
    const allowedUpdates = {};

    const fields = [
      "score",
      "total",
      "percent",
      "status",
      "topic",
      "title",
      "grade",
      "timeTakenSeconds"
    ];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        allowedUpdates[field] = req.body[field];
      }
    });

    if (allowedUpdates.score !== undefined) {
      allowedUpdates.score = Number(allowedUpdates.score);
    }

    if (allowedUpdates.total !== undefined) {
      allowedUpdates.total = Number(allowedUpdates.total);
    }

    if (allowedUpdates.percent !== undefined) {
      allowedUpdates.percent = Number(allowedUpdates.percent);
    }

    if (allowedUpdates.grade !== undefined && allowedUpdates.grade !== "") {
      allowedUpdates.grade = Number(allowedUpdates.grade);
    }

    const result = await Result.findByIdAndUpdate(
      req.params.id,
      { $set: allowedUpdates },
      { new: true, runValidators: true }
    );

    if (!result) {
      return res.status(404).json({
        message: "Learner result not found."
      });
    }

    return res.json({
      message: "Learner result updated successfully.",
      result
    });

  } catch (error) {
    console.error("PATCH /api/admin/learner-results/:id error:", error);

    return res.status(500).json({
      message: "Could not update learner result."
    });
  }
});

app.delete("/api/admin/learner-results/:id", authRequired, employeeAdminOnly, async (req, res) => {
  try {
    const result = await Result.findByIdAndDelete(req.params.id);

    if (!result) {
      return res.status(404).json({
        message: "Learner result not found."
      });
    }

    return res.json({
      message: "Learner result removed successfully."
    });

  } catch (error) {
    console.error("DELETE /api/admin/learner-results/:id error:", error);

    return res.status(500).json({
      message: "Could not remove learner result."
    });
  }
});

/* ------------------ PUBLISH HELPERS ------------------ */
async function sendPublishedQuizEmails(quiz) {
  if (!quiz || !quiz.sendPublishEmail) return;

  try {
    const learners = await User.find({
      role: "learner",
      accountType: "learner",
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
/* =====================================================
   QUIZ RATINGS SYSTEM
   Paste into server.js
===================================================== */

/* ---------- Quiz Rating Model ---------- */
const QuizRatingSchema = new mongoose.Schema(
  {
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true
    },

    learnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },

    comment: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    }
  },
  { timestamps: true }
);

/* one learner = one rating per quiz */
QuizRatingSchema.index(
  { quizId: 1, learnerId: 1 },
  { unique: true }
);

const QuizRating =
  mongoose.models.QuizRating ||
  mongoose.model("QuizRating", QuizRatingSchema);


/* ---------- Helpers ---------- */
function cleanRatingNumber(value) {
  const n = Number(value);

  if (!Number.isInteger(n)) return null;
  if (n < 1 || n > 5) return null;

  return n;
}

function cleanRatingComment(value) {
  return String(value || "")
    .trim()
    .slice(0, 500);
}


/* =====================================================
   ROUTE 1: Save / Update Learner Rating
===================================================== */
app.post("/api/quizzes/:id/rate", authRequired, async (req, res) => {
  try {
    const quizId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({
        message: "Invalid quiz id."
      });
    }

    const rating = cleanRatingNumber(req.body.rating);
    const comment = cleanRatingComment(req.body.comment);

    if (!rating) {
      return res.status(400).json({
        message: "Rating must be from 1 to 5."
      });
    }

    const quiz = await Quiz.findById(quizId).select("_id");

    if (!quiz) {
      return res.status(404).json({
        message: "Quiz not found."
      });
    }

    const saved = await QuizRating.findOneAndUpdate(
      {
        quizId: quizId,
        learnerId: req.user.userId
      },
      {
        $set: {
          rating: rating,
          comment: comment
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    return res.json({
      message: "Rating saved successfully.",
      rating: {
        quizId: saved.quizId,
        learnerId: saved.learnerId,
        rating: saved.rating,
        comment: saved.comment,
        updatedAt: saved.updatedAt
      }
    });

  } catch (error) {
    console.error("POST /api/quizzes/:id/rate", error);

    return res.status(500).json({
      message: "Could not save rating."
    });
  }
});


/* =====================================================
   ROUTE 2: Single Quiz Rating Summary
===================================================== */
app.get("/api/quizzes/:id/rating", authRequired, async (req, res) => {
  try {
    const quizId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({
        message: "Invalid quiz id."
      });
    }

    const quiz = await Quiz.findById(quizId).select("_id");

    if (!quiz) {
      return res.status(404).json({
        message: "Quiz not found."
      });
    }

    const stats = await QuizRating.aggregate([
      {
        $match: {
          quizId: new mongoose.Types.ObjectId(quizId)
        }
      },
      {
        $group: {
          _id: "$quizId",
          averageRating: { $avg: "$rating" },
          ratingsCount: { $sum: 1 }
        }
      }
    ]);

    const myRating = await QuizRating.findOne({
      quizId: quizId,
      learnerId: req.user.userId
    }).select("rating comment updatedAt");

    return res.json({
      quizId: quizId,

      averageRating:
        stats[0]?.averageRating
          ? Number(stats[0].averageRating.toFixed(1))
          : 0,

      ratingsCount:
        stats[0]?.ratingsCount || 0,

      myRating: myRating
        ? {
            rating: myRating.rating,
            comment: myRating.comment,
            updatedAt: myRating.updatedAt
          }
        : null
    });

  } catch (error) {
    console.error("GET /api/quizzes/:id/rating", error);

    return res.status(500).json({
      message: "Could not load rating."
    });
  }
});


/* =====================================================
   ROUTE 3: Many Quiz Ratings Summary
   Example:
   /api/quizzes/ratings/summary?ids=id1,id2,id3
===================================================== */
app.get("/api/quizzes/ratings/summary", authRequired, async (req, res) => {
  try {
    const idsRaw = String(req.query.ids || "").trim();

    if (!idsRaw) {
      return res.json({});
    }

    const ids = idsRaw
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
      .filter(id => mongoose.Types.ObjectId.isValid(id));

    if (!ids.length) {
      return res.json({});
    }

    const objectIds = ids.map(id =>
      new mongoose.Types.ObjectId(id)
    );

    const stats = await QuizRating.aggregate([
      {
        $match: {
          quizId: { $in: objectIds }
        }
      },
      {
        $group: {
          _id: "$quizId",
          averageRating: { $avg: "$rating" },
          ratingsCount: { $sum: 1 }
        }
      }
    ]);

    const output = {};

    for (const row of stats) {
      output[String(row._id)] = {
        averageRating: row.averageRating
          ? Number(row.averageRating.toFixed(1))
          : 0,

        ratingsCount: row.ratingsCount || 0
      };
    }

    for (const id of ids) {
      if (!output[id]) {
        output[id] = {
          averageRating: 0,
          ratingsCount: 0
        };
      }
    }

    return res.json(output);

  } catch (error) {
    console.error("GET /api/quizzes/ratings/summary", error);

    return res.status(500).json({
      message: "Could not load ratings."
    });
  }
});
/* ------------------ AUTH ROUTES ------------------ */
app.get(
  "/api/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

app.get(
  "/api/auth/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "https://practiceonline.co.za/login.html",
  }),
  async (req, res) => {
    const token = jwt.sign(
      { userId: req.user._id, role: req.user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.redirect(
  `https://practiceonline.co.za/login.html?googleToken=${encodeURIComponent(token)}`
);
  }
);

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
// REGISTER
app.post("/api/register", registerLimiter, async (req, res) => {
  try {
const {
  firstName,
  surname,
  fullName,
  username,
  email,
  grade,
  curriculum,
  password,
  accountType,
  province,
  district,
  cellphone,
  guardianCellphone,
  guestReasons,
  otherReason,
  guestMessage,
  schoolName,
  currentMarkRange,
  gender
} = req.body;

    if (!username || !email || !password || !accountType) {
      return res.status(400).json({
        message: "Username, email, password, and account type are required.",
      });
    }

    if (!["learner", "practice", "guest"].includes(accountType)) {
  return res.status(400).json({
    message: "Invalid account type."
  });
}

    let gradeNum = null;
    if (accountType === "learner" || accountType === "practice") {
      if (grade === undefined || grade === null || grade === "") {
        return res.status(400).json({
          message: "Grade is required for learner and practice accounts.",
        });
      }
      gradeNum = Number(grade);
      if (!Number.isInteger(gradeNum) || gradeNum < 8 || gradeNum > 12) {
        return res.status(400).json({
          message: "Grade must be between 8 and 12.",
        });
      }
    }
if (
  (accountType === "learner" || accountType === "practice") &&
  !curriculum
) {
  return res.status(400).json({
    message: "Curriculum is required."
  });
}
const strongPasswordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

if (!strongPasswordRegex.test(String(password))) {
  return res.status(400).json({
    message:
      "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
  });
}
if (accountType === "guest") {
  if (!province || !district) {
    return res.status(400).json({
      message: "Province and district are required."
    });
  }

  if (!Array.isArray(guestReasons) || !guestReasons.length) {
    return res.status(400).json({
      message: "Please select at least one reason."
    });
  }

  if (
    guestReasons.includes("other") &&
    !String(otherReason || "").trim()
  ) {
    return res.status(400).json({
      message: "Please specify the other reason."
    });
  }
}
    const cleanUsername = cleanSpaces(username);
    const cleanEmail = String(email || "").toLowerCase().trim();
    const cleanFirstName = cleanSpaces(firstName || "");
    const cleanSurname = cleanSpaces(surname || "");
    const cleanFullName =
      cleanSpaces(fullName || "") || cleanSpaces(`${cleanFirstName} ${cleanSurname}`);

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
    const learnerNumber = await generateUniqueLearnerNumber(accountType);

    const rawVerifyToken = makeVerifyToken();
    const verifyTokenHash = hashToken(rawVerifyToken);
    const verifyTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const now = new Date();
    const trialDays = 7;

    const user = await User.create({
      firstName: cleanFirstName,
      surname: cleanSurname,
      fullName: cleanFullName,
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      role: "learner",
      accountType,
      learnerNumber,
      studentNumber: null,
      grade: gradeNum,
      curriculum: curriculum || "",
      enrollmentStatus: accountType === "learner" ? "pending" : "not_required",
      phoneVerified: false,
      guestReasons: Array.isArray(guestReasons) ? guestReasons : [],
      otherReason: cleanSpaces(otherReason || ""),
      guestMessage: cleanSpaces(guestMessage || ""),
      schoolName: cleanSpaces(schoolName || ""),
      currentMarkRange: String(currentMarkRange || "").trim(),
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

try {
  const displayName = user.fullName || user.username || "there";

  const verifyButtonHtml = `
    <p style="margin:20px 0;">
      <a
        href="${verifyUrl}"
        target="_blank"
        style="
          display:inline-block;
          padding:12px 24px;
          background:#1b1648;
          color:#ffffff;
          text-decoration:none;
          border-radius:6px;
          font-weight:bold;
          font-size:14px;
        "
      >
        Verify Email Address
      </a>
    </p>
  `;

  let accountMessageHtml = "";
  let accountMessageText = "";

  if (user.accountType === "learner") {
    accountMessageHtml = `
      <p>Your learner number is: <strong>${user.learnerNumber}</strong></p>
      <p>Your Learner Account has been created successfully.</p>
      <p>We are excited to be part of your academic journey and are committed to helping you achieve your goals and reach greater heights in your studies.</p>
      <p>You may now enroll for classes and begin accessing the opportunities available through Practice Online.</p>
    `;

    accountMessageText = `
Your learner number is: ${user.learnerNumber}

Your Learner Account has been created successfully.

We are excited to be part of your academic journey and are committed to helping you achieve your goals and reach greater heights in your studies.

You may now enroll for classes and begin accessing the opportunities available through Practice Online.
    `;
  }

  else if (user.accountType === "practice") {
    accountMessageHtml = `
      <p>Your practice number is: <strong>${user.learnerNumber}</strong></p>
      <p>Your Practice Account has been created successfully.</p>
      <p>You now have access to practice quizzes, assignments, challenges, announcements and learning content.</p>
      <p>We are committed to helping you build confidence, strengthen your skills and reach greater heights through continuous learning and practice.</p>
    `;

    accountMessageText = `
Your practice number is: ${user.learnerNumber}

Your Practice Account has been created successfully.

You now have access to practice quizzes, assignments, challenges, announcements and learning content.

We are committed to helping you build confidence, strengthen your skills and reach greater heights through continuous learning and practice.
    `;
  }

  else if (user.accountType === "guest") {
    accountMessageHtml = `
      <p>Your Guest Account has been created successfully.</p>
      <p>Thank you for choosing Practice Online.</p>
      <p>Whether you are exploring opportunities, seeking information, looking for collaboration, or learning more about our services, we are delighted to have you with us.</p>
      <p>Our team is committed to supporting you and helping you discover how Practice Online can assist you in reaching greater heights.</p>
    `;

    accountMessageText = `
Your Guest Account has been created successfully.

Thank you for choosing Practice Online.

Whether you are exploring opportunities, seeking information, looking for collaboration, or learning more about our services, we are delighted to have you with us.

Our team is committed to supporting you and helping you discover how Practice Online can assist you in reaching greater heights.
    `;
  }

  await sendEmail({
    to: user.email,
    subject: "Welcome to Practice Online - Verify Your Email",
    text: `Hi ${displayName},

Welcome to Practice Online.

Please verify your email address here:

${verifyUrl}

${accountMessageText}

This verification link expires in 24 hours.

Practice Online Team`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.7;">
        <p>Hi ${displayName},</p>

        <p>Welcome to <strong>Practice Online</strong>.</p>

        ${verifyButtonHtml}

        ${accountMessageHtml}

        <p>Please verify your email address by clicking the button above.</p>

        <p>This verification link expires in 24 hours.</p>

        <p>
          Kind Regards,<br>
          <strong>Practice Online Team</strong>
        </p>
      </div>
    `,
  });

  console.log("Verification email sent successfully to:", user.email);
} catch (emailErr) {
  console.error("Verification email failed:", emailErr);
}

    return res.status(201).json({
      message: "Account created successfully.",
      accountType: user.accountType,
      learnerNumber: user.learnerNumber,
    });

  } catch (err) {
    console.error("Register error:", err);
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
app.post("/api/login", loginLimiter, async (req, res) => {
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

    if (grade !== undefined && (user.accountType === "learner" ||user.accountType === "practice")){
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
            accountType: "learner",
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
            accountType: { $in: ["learner", "practice"] },
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

const learnerRowType = accountTypeByGradeRaw.find(
  (x) => Number(x._id.grade) === g && x._id.accountType === "learner"
);

const practiceRowType = accountTypeByGradeRaw.find(
  (x) => Number(x._id.grade) === g && x._id.accountType === "practice"
);

const learnerCount = learnerRowType ? Number(learnerRowType.count) : 0;
const practiceCount = practiceRowType ? Number(practiceRowType.count) : 0;

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
        learner: learnerCount,
        practice: practiceCount,
        total: learnerCount + practiceCount,
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
        accountType: "learner",
        grade: { $ne: null },
      }),
      User.distinct("province", {
        role: "learner",
        accountType: "learner",
        province: { $exists: true, $ne: "" },
      }),
      User.find(
        {
          role: "learner",
          accountType: "learner",
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
      "user.accountType": "learner",
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

    if (!u) {
      return res.status(401).json({
        message: "User not found"
      });
    }

    const wantsAll = String(req.query.all || "") === "1";

    let filter = {};

    if (isPrivilegedRole(u.role) && wantsAll) {
      filter = {};
    } else if (canManageQuizzes(u.role)) {
      if (req.query.onlyPublished === "1") {
        filter.isPublished = true;
      }
    } else {
      if (!u.grade) {
        return res.json([]);
      }

      const now = new Date();

      filter.grade = u.grade;
      filter.isPublished = true;
      filter.$or = [
        { publishAt: null },
        { publishAt: { $lte: now } }
      ];
    }

    const quizzes = await Quiz.find(filter)
      .sort({ createdAt: -1 })
      .select(
        "assessmentCode grade title topic contentType audience isForAllLearners accessLevel isPremium requiresPayment accessFee paper difficulty questions timeLimitMinutes instructions isFrozen availableFrom availableUntil createdAt updatedAt frozenAt isPublished publishedAt publishAt sendPublishEmail"
      );

    return res.json(quizzes);
  } catch (e) {
    console.error("GET /api/quizzes error:", e.message);

    return res.status(500).json({
      message: "Server error"
    });
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
  contentType,
  audience,
  isForAllLearners,
  accessLevel,
  accessFee,
      
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

const finalAccessLevel = normalizeQuizAccessLevel(accessLevel);

const assessmentCode = await generateAssessmentCode(
  g,
  quizPaper
);

const quiz = await Quiz.create({
  assessmentCode,

  grade: g,
  title: quizTitle,
  topic: quizTopic,
  paper: quizPaper,

  contentType: contentType || "quiz",
  audience: audience || "grade",
  isForAllLearners: !!isForAllLearners,

  accessLevel: finalAccessLevel,
  isPremium: finalAccessLevel === "premium",
  requiresPayment: finalAccessLevel === "premium",

  accessFee:
    finalAccessLevel === "premium"
      ? Math.max(0, Number(accessFee) || 0)
      : 0,

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
  assessmentCode: quiz.assessmentCode,
  accessLevel: quiz.accessLevel,
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
      "accessLevel",
      "accessFee",
      
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
      if (key === "accessLevel") {
  quiz.accessLevel = normalizeQuizAccessLevel(req.body.accessLevel);
  quiz.isPremium = quiz.accessLevel === "premium";
  quiz.requiresPayment = quiz.accessLevel === "premium";

  if (quiz.accessLevel === "standard") {
    quiz.accessFee = 0;
  }

  continue;
}

if (key === "accessFee") {
  const fee = Number(req.body.accessFee);

  if (!Number.isFinite(fee) || fee < 0) {
    return res.status(400).json({
      message: "Access fee must be 0 or more."
    });
  }

  quiz.accessFee =
    quiz.accessLevel === "premium"
      ? fee
      : 0;

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

/* ------------------ RESULTS ------------------ */

function isUnavailableBySchedule(quiz) {
  const now = new Date();

  if (quiz?.isFrozen) return true;

  if (quiz?.isPublished !== true) return true;
  if (quiz?.publishAt) {
    const p = new Date(quiz.publishAt);
    if (!isNaN(p.getTime()) && now < p) return true;
  }

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

function normalizeAnswer(ans) {
  return String(ans || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/−/g, "-")
    .replace(/^[a-z]+\s*=\s*/, "");
}

function parseNumberOrFraction(input) {
  const s = normalizeAnswer(input);
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
  return normalizeAnswer(s);
}

function splitPossibleAnswers(value) {
  return String(value || "")
    .split("|")
    .map(v => String(v || "").trim())
    .filter(Boolean);
}

function splitLearnerAnswers(value) {
  return String(value || "")
    .trim()
    .split(/\s*(?:or|and|;|\|)\s*/i)
    .map(v => String(v || "").trim())
    .filter(Boolean);
}

function compareTextAnswer(userAns, correctAns, mode, tolerance) {
  const uaRaw = String(userAns || "").trim();
  const caRaw = String(correctAns || "").trim();
  if (!caRaw) return false;

  const allowedAnswers = splitPossibleAnswers(caRaw);
  const learnerAnswers = splitLearnerAnswers(uaRaw);
  const inputsToCheck = learnerAnswers.length ? learnerAnswers : [uaRaw];

  for (const rawInput of inputsToCheck) {
    for (const allowed of allowedAnswers) {
      const uNum = parseNumberOrFraction(rawInput);
      const cNum = parseNumberOrFraction(allowed);

      if (mode === "number_tolerance") {
        const tol = Number(tolerance);
        if (
          uNum !== null &&
          cNum !== null &&
          Number.isFinite(tol) &&
          tol >= 0 &&
          Math.abs(uNum - cNum) <= tol
        ) {
          return true;
        }
      } else if (uNum !== null && cNum !== null) {
        const defaultTolerance = 0.01;
        if (Math.abs(uNum - cNum) <= defaultTolerance) {
          return true;
        }
      }

      const ua = normalizeTextAnswer(rawInput);
      const ca = normalizeTextAnswer(allowed);

      if (mode === "contains") {
        if (ua.includes(ca)) return true;
      } else {
        if (ua === ca) return true;
      }
    }
  }

  return false;
}


function normalizeTypedFieldKey(value, fallback = "") {
  return String(value || fallback || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeSubmittedTypedValues(answer) {
  const values = [];

  if (Array.isArray(answer?.typedValues)) {
    answer.typedValues.forEach((item, index) => {
      const key = normalizeTypedFieldKey(
        item?.key,
        `answer_${index + 1}`
      );

      if (!key) return;

      values.push({
        key,
        value: String(item?.value ?? item?.answer ?? "").trim(),
      });
    });
  } else if (
    answer?.typedValues &&
    typeof answer.typedValues === "object"
  ) {
    Object.entries(answer.typedValues).forEach(([rawKey, rawValue]) => {
      const key = normalizeTypedFieldKey(rawKey);
      if (!key) return;

      values.push({
        key,
        value: String(rawValue ?? "").trim(),
      });
    });
  }

  if (Array.isArray(answer?.answerFields)) {
    answer.answerFields.forEach((item, index) => {
      const key = normalizeTypedFieldKey(
        item?.key,
        `answer_${index + 1}`
      );

      if (!key) return;

      values.push({
        key,
        value: String(item?.value ?? item?.answer ?? "").trim(),
      });
    });
  }

  const unique = new Map();
  values.forEach((item) => unique.set(item.key, item));

  return [...unique.values()];
}

function normalizeCorrectTypedFields(question) {
  const fields = Array.isArray(question?.answerFields)
    ? question.answerFields
    : [];

  return fields
    .map((field, index) => ({
      key: normalizeTypedFieldKey(
        field?.key,
        `answer_${index + 1}`
      ),
      prefix: String(field?.prefix || "").trim(),
      suffix: String(field?.suffix || field?.unit || "").trim(),
      correctAnswer: String(
        field?.correctAnswer ?? field?.answer ?? ""
      ).trim(),
    }))
    .filter((field) => field.key);
}

function compareUnorderedTypedAnswer(
  userAnswer,
  correctAnswer,
  tolerance
) {
  const learnerValues = splitLearnerAnswers(userAnswer);
  const correctValues = splitPossibleAnswers(correctAnswer);

  if (
    learnerValues.length === 0 ||
    learnerValues.length !== correctValues.length
  ) {
    return false;
  }

  const used = new Set();

  for (const learnerValue of learnerValues) {
    let matchingIndex = -1;

    for (let index = 0; index < correctValues.length; index += 1) {
      if (used.has(index)) continue;

      if (
        compareTextAnswer(
          learnerValue,
          correctValues[index],
          "exact",
          tolerance
        )
      ) {
        matchingIndex = index;
        break;
      }
    }

    if (matchingIndex < 0) return false;
    used.add(matchingIndex);
  }

  return true;
}

function compareTypedAnswerValue(
  userAnswer,
  correctAnswer,
  mode,
  tolerance
) {
  const normalizedMode = String(mode || "exact")
    .toLowerCase()
    .trim();

  if (normalizedMode === "unordered") {
    return compareUnorderedTypedAnswer(
      userAnswer,
      correctAnswer,
      tolerance
    );
  }

  if (normalizedMode === "expression") {
    /*
     * Safe expression comparison:
     * use the existing normalised text/number comparison without
     * evaluating arbitrary JavaScript from learner input.
     */
    return compareTextAnswer(
      userAnswer,
      correctAnswer,
      "exact",
      tolerance
    );
  }

  return compareTextAnswer(
    userAnswer,
    correctAnswer,
    normalizedMode,
    tolerance
  );
}

app.post("/api/results", authRequired, async (req, res) => {
  try {
    const { quizId, answers, timeTakenSeconds } = req.body;

    if (!quizId || !Array.isArray(answers)) {
      return res.status(400).json({ message: "quizId and answers are required." });
    }

    const userId = req.user.userId;

    const me = await User.findById(userId).select("role");
    if (!me) return res.status(401).json({ message: "User not found" });

    const isAdminAttemptUser = isPrivilegedRole(me.role);

    if (!isAdminAttemptUser) {
      const existing = await Result.findOne({ userId, quizId }).select("_id");
      if (existing) return res.status(409).json({ message: "Already attempted" });
    }

    let attemptNo = 1;
    if (isAdminAttemptUser) {
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
        const correctFields = normalizeCorrectTypedFields(q);
        const submittedFields = normalizeSubmittedTypedValues(ans);

        const mode = String(q.textAnswerMode || "exact")
          .toLowerCase()
          .trim();

        const tol = Number(q.numberTolerance ?? 0);

        /*
         * Multiple typed-answer fields:
         * simultaneous equations, coordinates, matrices,
         * turning points and other multi-value questions.
         */
        if (correctFields.length > 0) {
          const submittedMap = new Map(
            submittedFields.map((field) => [
              field.key,
              field.value,
            ])
          );

          const checkedFields = correctFields.map((field) => {
            const learnerValue = String(
              submittedMap.get(field.key) ?? ""
            ).trim();

            const fieldIsCorrect = compareTypedAnswerValue(
              learnerValue,
              field.correctAnswer,
              mode,
              tol
            );

            return {
              key: field.key,
              prefix: field.prefix,
              suffix: field.suffix,
              value: learnerValue,
              correctAnswer: field.correctAnswer,
              isCorrect: fieldIsCorrect,
            };
          });

          const isCorrect =
            checkedFields.length > 0 &&
            checkedFields.every((field) => field.isCorrect);

          const earned = isCorrect ? qPoints : 0;
          scorePoints += earned;

          const textAnswer = checkedFields
            .map((field) => `${field.key}=${field.value}`)
            .join("|");

          const correctText = checkedFields
            .map(
              (field) =>
                `${field.key}=${field.correctAnswer}`
            )
            .join("|");

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

            // Backward compatibility
            textAnswer,
            correctText,

            // Universal typed-answer values
            typedValues: checkedFields.map((field) => ({
              key: field.key,
              value: field.value,
            })),

            correctTypedValues: checkedFields.map((field) => ({
              key: field.key,
              value: field.correctAnswer,
            })),

            answerFields: checkedFields,

            instruction: String(q.instruction || "").trim(),
            answerPrefix: String(q.answerPrefix || "").trim(),
            answerSuffix: String(
              q.answerSuffix || q.unit || ""
            ).trim(),
            unit: String(
              q.unit || q.answerSuffix || ""
            ).trim(),

            hint,
            solution,
            answerMode: mode,
            tolerance:
              mode === "number_tolerance" &&
              Number.isFinite(tol)
                ? tol
                : null,
            roundTo: null,
            isCorrect,
            questionText,
            options: [],
          };
        }

        /*
         * Normal single typed answer.
         */
        const userText = cleanSpaces(
          ans.textAnswer ??
          ans.value ??
          ans.answer ??
          ""
        );

        const correctText = cleanSpaces(q.correctText || "");

        const isCorrect = compareTypedAnswerValue(
          userText,
          correctText,
          mode,
          tol
        );

        const earned = isCorrect ? qPoints : 0;
        scorePoints += earned;

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

          typedValues: [],
          correctTypedValues: [],
          answerFields: [],

          instruction: String(q.instruction || "").trim(),
          answerPrefix: String(q.answerPrefix || "").trim(),
          answerSuffix: String(
            q.answerSuffix || q.unit || ""
          ).trim(),
          unit: String(
            q.unit || q.answerSuffix || ""
          ).trim(),

          hint,
          solution,
          answerMode: mode,
          tolerance:
            mode === "number_tolerance" &&
            Number.isFinite(tol)
              ? tol
              : null,
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
      isAdminAttempt: isAdminAttemptUser,
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

app.get("/api/results/my", authRequired, async (req, res) => {
  try {
    const userId = req.user.userId;

    const results = await Result.find({ userId }).sort({ createdAt: -1 });

    const resultsWithRank = await Promise.all(results.map(async (r) => {
      const all = await Result.find({ quizId: r.quizId }).sort({
        percent: -1,
        timeTakenSeconds: 1,
        createdAt: 1
      });

      let rank = 1;
      let prevScore = null;
      let actualRank = null;

      for (let i = 0; i < all.length; i++) {
        if (all[i].percent !== prevScore) {
          rank = i + 1;
        }

        if (String(all[i]._id) === String(r._id)) {
          actualRank = rank;
          break;
        }

        prevScore = all[i].percent;
      }

      return {
        ...r.toObject(),
        rank: actualRank,
        totalStudents: all.length
      };
    }));

    return res.json(resultsWithRank);
  } catch (err) {
    console.error("GET /api/results/my error:", err.message);
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
        currentUser.email || BREVO_SENDER_EMAIL || "no-reply@practiceonline.co.za"
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


/* ------------------ ANNOUNCEMENTS ------------------ */

async function announcementManagerOnly(req, res, next) {
  try {
    const u = await User.findById(req.user.userId).select("role");
    if (!u) return res.status(401).json({ message: "User not found" });

    const role = String(u.role || "").toLowerCase().trim();

    if (!["admin", "editor", "tester"].includes(role)) {
      return res.status(403).json({ message: "Admin/editor/tester only" });
    }

    next();
  } catch {
    res.status(500).json({ message: "Server error" });
  }
}

// CREATE ANNOUNCEMENT
app.post("/api/announcements", authRequired, announcementManagerOnly, async (req, res) => {
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

    if (!safeTrim(title)) {
      return res.status(400).json({ message: "Title is required." });
    }

    if (!safeTrim(message)) {
      return res.status(400).json({ message: "Message is required." });
    }

    const announcement = await Announcement.create({
      title: cleanSpaces(title),
      message: String(message).trim(),
      grade: normalizeAnnouncementGrade(grade),
      category: normalizeAnnouncementCategory(category),
      isPublished: typeof isPublished === "boolean" ? isPublished : true,
      sendToStudents: !!sendToStudents,
      urgentNotice: !!urgentNotice,
      meetingLink: String(meetingLink || "").trim(),
      meetingDate: String(meetingDate || "").trim(),
      meetingTime: String(meetingTime || "").trim(),
      dueDate: String(dueDate || "").trim(),
      quizStatus: String(quizStatus || "Open").trim(),
      createdBy: req.user.userId,
    });

    // sendToStudents = email/notification only
    if (announcement.sendToStudents) {
      try {
        let gradeNumbers = [];

        if (announcement.grade === "allGrades") {
          gradeNumbers = [8, 9, 10, 11, 12];
        } else {
          const n = Number(String(announcement.grade).replace("grade", ""));
          if (Number.isInteger(n)) gradeNumbers = [n];
        }

        const learners = await User.find({
          role: "learner",
          accountType: "learner",
          grade: { $in: gradeNumbers },
          email: { $exists: true, $ne: "" },
          emailVerified: true,
        }).select("email");

        const recipients = learners
          .map((u) => String(u.email || "").trim().toLowerCase())
          .filter(Boolean);

        if (recipients.length) {
          const subject = `New ${announcement.category} announcement`;

          const html = `
            <div style="font-family:Arial,sans-serif; line-height:1.6;">
              <p>Hello,</p>
              <p>A new announcement has been posted on Practice Online.</p>
              <p><b>${announcement.title}</b></p>
              <p>${announcement.message}</p>
              ${
                announcement.category === "class" || announcement.category === "all"
                  ? `
                    <p>
                      <b>Meeting date:</b> ${announcement.meetingDate || "Not set"}<br/>
                      <b>Meeting time:</b> ${announcement.meetingTime || "Not set"}<br/>
                      <b>Meeting link:</b> ${announcement.meetingLink || "Not set"}
                    </p>
                  `
                  : ""
              }
              ${
                announcement.category === "quiz" || announcement.category === "all"
                  ? `
                    <p>
                      <b>Due date:</b> ${announcement.dueDate || "Not set"}<br/>
                      <b>Status:</b> ${announcement.quizStatus || "Open"}
                    </p>
                  `
                  : ""
              }
              <p>Please log in to Practice Online to view the full announcement.</p>
            </div>
          `;

          const text = `${announcement.title}\n\n${announcement.message}`;

          await sendBulkEmail({
            recipients,
            subject,
            html,
            text,
          });
        }
      } catch (emailErr) {
        console.error("Announcement email send failed:", emailErr.message);
      }
    }

    return res.status(201).json({
      message: "Announcement created successfully.",
      announcement,
    });
  } catch (err) {
    console.error("POST /api/announcements error:", err.message);
    return res.status(500).json({ message: "Failed to create announcement." });
  }
});

// ======================================================
// LEADERBOARD
// Filters:
//   ?grade=8
//   ?period=thisWeek
//   ?period=lastWeek
//   ?period=1 ... 12  (January to December)
// Ranking:
//   total average across every attempted quiz in that period
// ======================================================
app.get("/api/leaderboard", authRequired, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.userId).select(
      "username fullName grade learnerNumber studentNumber role accountType"
    );

    if (!currentUser) {
      return res.status(401).json({ message: "User not found." });
    }

    const gradeQuery = String(req.query.grade || "").trim();
    const period = String(req.query.period || "thisWeek").trim();

    const resultFilter = {
      isAdminAttempt: { $ne: true }
    };

    // -----------------------------
    // TIME FILTER
    // -----------------------------
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (period === "thisWeek") {
      const day = todayStart.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - diffToMonday);

      resultFilter.createdAt = { $gte: weekStart };
    } else if (period === "lastWeek") {
      const day = todayStart.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;

      const thisWeekStart = new Date(todayStart);
      thisWeekStart.setDate(todayStart.getDate() - diffToMonday);

      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(thisWeekStart.getDate() - 7);

      resultFilter.createdAt = {
        $gte: lastWeekStart,
        $lt: thisWeekStart,
      };
    } else {
      const monthNumber = Number(period);

      if (Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
        const year = now.getFullYear();
        const monthStart = new Date(year, monthNumber - 1, 1);
        const nextMonthStart = new Date(year, monthNumber, 1);

        resultFilter.createdAt = {
          $gte: monthStart,
          $lt: nextMonthStart,
        };
      }
    }

    // -----------------------------
    // LOAD RESULTS
    // -----------------------------
    const results = await Result.find(resultFilter).select(
      "userId score total percent createdAt grade isAdminAttempt"
    );

    const userIds = [...new Set(
      results.map(r => String(r.userId || "")).filter(Boolean)
    )];

    const userFilter = {
      _id: { $in: userIds },
      role: "learner",
      accountType: "learner",
    };

    if (gradeQuery) {
      userFilter.grade = Number(gradeQuery);
    }

    // -----------------------------
    // LOAD USERS
    // -----------------------------
    const users = await User.find(userFilter).select(
      "username fullName name surname grade learnerNumber studentNumber province"
    );

    const userMap = new Map(users.map(u => [String(u._id), u]));

    // -----------------------------
    // GROUP RESULTS PER USER
    // -----------------------------
    const grouped = new Map();

    for (const r of results) {
      const uid = String(r.userId || "");
      if (!uid || !userMap.has(uid)) continue;

      const score = Number(r.score || 0);
      const total = Number(r.total || 0);

      const percent = Number.isFinite(Number(r.percent))
        ? Number(r.percent)
        : (total > 0 ? (score / total) * 100 : 0);

      if (!grouped.has(uid)) {
        grouped.set(uid, []);
      }

      grouped.get(uid).push(percent);
    }

    // -----------------------------
    // BUILD LEADERBOARD
    // -----------------------------
    let rows = [...grouped.entries()].map(([uid, percents]) => {
      const user = userMap.get(uid);
      const attempts = percents.length;

      const average = attempts
        ? percents.reduce((sum, n) => sum + n, 0) / attempts
        : 0;

      const best = attempts
        ? Math.max(...percents)
        : 0;

      return {
        userId: uid,
        username: user?.username || "",
        learnerNumber: user?.learnerNumber || user?.studentNumber || "",
        province: user?.province || "-",
        grade: user?.grade ? `Grade ${user.grade}` : "—",
        attempts,
        average: Math.round(average),
        best: Math.round(best),
      };
    });

    rows.sort((a, b) => {
      if (b.average !== a.average) return b.average - a.average;
      if (b.best !== a.best) return b.best - a.best;
      return b.attempts - a.attempts;
    });

    rows = rows.map((row, index) => ({
      ...row,
      rank: index + 1,
      isMe: String(row.userId) === String(req.user.userId),
    }));

    const me = rows.find(r => String(r.userId) === String(req.user.userId)) || null;

    return res.json({
      rows,
      me,
    });
  } catch (err) {
    console.error("GET /api/leaderboard error:", err.message);
    return res.status(500).json({ message: "Failed to load leaderboard." });
  }
});

// GET ANNOUNCEMENTS FOR LEARNERS / ADMIN
app.get("/api/announcements", authRequired, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.userId).select("role grade");
    if (!currentUser) {
      return res.status(401).json({ message: "User not found." });
    }

    const queryGrade = safeTrim(req.query.grade);
    const queryCategory = safeTrim(req.query.category);
    const q = safeTrim(req.query.q);

    const filter = {};

    if (isPrivilegedRole(currentUser.role) || ["editor"].includes(String(currentUser.role || "").toLowerCase())) {
      if (queryGrade) {
        filter.grade = normalizeAnnouncementGrade(queryGrade);
      }

      if (typeof req.query.isPublished !== "undefined") {
        filter.isPublished = String(req.query.isPublished) === "true";
      }
    } else {
      // IMPORTANT:
      // Published announcements must show in app even if sendToStudents = false
      filter.isPublished = true;

      const learnerGrade = gradeToAnnouncementGrade(currentUser.grade);
      filter.grade = { $in: [learnerGrade, "allGrades"] };
    }

    if (queryCategory) {
      const cat = normalizeAnnouncementCategory(queryCategory);
      if (cat !== "all") {
        filter.category = { $in: [cat, "all"] };
      }
    }

    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ title: rx }, { message: rx }];
    }

    const announcements = await Announcement.find(filter)
      .sort({ urgentNotice: -1, createdAt: -1 })
      .populate("createdBy", "username email role");

    const mapped = announcements.map((a) => stripAnnouncementForUser(a, req.user.userId));

    const generalAnnouncements = mapped.filter(
      (a) => a.category === "general" || a.category === "all"
    );

    const classAnnouncements = mapped.filter(
      (a) => a.category === "class" || a.category === "all"
    );

    const quizAnnouncements = mapped.filter(
      (a) => a.category === "quiz" || a.category === "all"
    );

    const latestUrgent = mapped.find((a) => a.urgentNotice);

    return res.json({
      updatedAt: mapped[0]?.updatedAt || null,
      urgentNotice: latestUrgent?.message || "",
      weeklyFocus: latestUrgent?.title || "",
      generalAnnouncements,
      classAnnouncements,
      quizAnnouncements,
      announcements: mapped,
    });
  } catch (err) {
    console.error("GET /api/announcements error:", err.message);
    return res.status(500).json({ message: "Failed to load announcements." });
  }
});

// ADMIN LIST
app.get("/api/announcements/admin/list", authRequired, announcementManagerOnly, async (req, res) => {
  try {
    const items = await Announcement.find({})
      .sort({ createdAt: -1 })
      .populate("createdBy", "username email");

    return res.json(items);
  } catch (err) {
    console.error("GET /api/announcements/admin/list error:", err.message);
    return res.status(500).json({ message: "Failed to load admin announcements." });
  }
});

// PROFILE SUMMARY
app.get("/api/announcements/profile-summary", authRequired, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.userId).select("role grade");
    if (!currentUser) {
      return res.status(401).json({ message: "User not found." });
    }

    let gradeFilter = ["allGrades"];

    if (!isPrivilegedRole(currentUser.role) && String(currentUser.role || "").toLowerCase() !== "editor") {
      gradeFilter = [gradeToAnnouncementGrade(currentUser.grade), "allGrades"];
    }

    // IMPORTANT:
    // Do NOT filter by sendToStudents here.
    // Published in-app announcements must still count and show.
    const baseFilter = {
      isPublished: true,
      grade: { $in: gradeFilter },
    };

    const latest = await Announcement.findOne(baseFilter).sort({ createdAt: -1 });
    const count = await Announcement.countDocuments(baseFilter);

    return res.json({
      count,
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
  } catch (err) {
    console.error("GET /api/announcements/profile-summary error:", err.message);
    return res.status(500).json({ message: "Failed to load announcement summary." });
  }
});

// UPDATE ANNOUNCEMENT
app.put("/api/announcements/:id", authRequired, announcementManagerOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid announcement id." });
    }

    const announcement = await Announcement.findById(id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found." });
    }

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

    announcement.title = cleanSpaces(title ?? announcement.title);
    announcement.message = String(message ?? announcement.message).trim();
    announcement.grade = normalizeAnnouncementGrade(grade ?? announcement.grade);
    announcement.category = normalizeAnnouncementCategory(category ?? announcement.category);

    if (typeof isPublished === "boolean") announcement.isPublished = isPublished;
    if (typeof sendToStudents === "boolean") announcement.sendToStudents = sendToStudents;
    if (typeof urgentNotice === "boolean") announcement.urgentNotice = urgentNotice;

    announcement.meetingLink = String(meetingLink ?? announcement.meetingLink ?? "").trim();
    announcement.meetingDate = String(meetingDate ?? announcement.meetingDate ?? "").trim();
    announcement.meetingTime = String(meetingTime ?? announcement.meetingTime ?? "").trim();
    announcement.dueDate = String(dueDate ?? announcement.dueDate ?? "").trim();
    announcement.quizStatus = String(quizStatus ?? announcement.quizStatus ?? "Open").trim();

    await announcement.save();

    return res.json({
      message: "Announcement updated successfully.",
      announcement,
    });
  } catch (err) {
    console.error("PUT /api/announcements/:id error:", err.message);
    return res.status(500).json({ message: "Failed to update announcement." });
  }
});

// DELETE ANNOUNCEMENT
app.delete("/api/announcements/:id", authRequired, announcementManagerOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid announcement id." });
    }

    const deleted = await Announcement.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    return res.json({ message: "Announcement deleted successfully." });
  } catch (err) {
    console.error("DELETE /api/announcements/:id error:", err.message);
    return res.status(500).json({ message: "Failed to delete announcement." });
  }
});

// ===============================================
// RESPOND TO CLASS ANNOUNCEMENT (AVAILABLE / UNAVAILABLE)
// ===============================================
app.post("/api/announcements/:id/respond", authRequired, async (req, res) => {
  try {
    const { response } = req.body;

    // validate
    if (!["accepted", "rejected"].includes(String(response))) {
      return res.status(400).json({ message: "Invalid response." });
    }

    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    // only allow class announcements
    if (announcement.category !== "class" && announcement.category !== "all") {
      return res.status(400).json({ message: "Not allowed for this announcement." });
    }

    const userId = req.user.userId;

    // check if already responded
    const existing = announcement.responses.find(
      (r) => String(r.student) === String(userId)
    );

    if (existing) {
      existing.response = response;
      existing.respondedAt = new Date();
    } else {
      announcement.responses.push({
        student: userId,
        response,
        respondedAt: new Date(),
      });
    }

    await announcement.save();

    return res.json({
      message: "Response saved successfully.",
      myResponse: response,
    });

  } catch (err) {
    console.error("RESPOND ERROR:", err.message);
    return res.status(500).json({ message: "Failed to save response." });
  }
});
// ADMIN VIEW RESPONSES FOR ONE ANNOUNCEMENT
app.get("/api/announcements/:id/responses", authRequired, announcementManagerOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid announcement id." });
    }

    const announcement = await Announcement.findById(id).populate(
      "responses.student",
      "fullName username email grade studentNumber"
    );

    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    return res.json({
      announcementId: announcement._id,
      title: announcement.title,
      category: announcement.category,
      responses: announcement.responses || [],
    });
  } catch (err) {
    console.error("GET /api/announcements/:id/responses error:", err.message);
    return res.status(500).json({ message: "Failed to load responses." });
  }
});



/* ------------------ ACCESS + PAYMENT ROUTES ------------------ */
app.use("/api/access", accessRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/tutors", tutorRoutes);
app.use("/api/manual-payments", manualPaymentsRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/opportunities", opportunitiesRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/request-quote", requestQuoteRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/tasks", tasksRoutes);

/* ------------------ SUPPORT MODEL ------------------ */
const SupportRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fullName: String,
    username: String,
    email: String,
    subject: { type: String, default: "Maths" },
    requestType: String,
    requestFollowUp: String,
    changeAccount: {
      currentAccountType: String,
      newAccountType: String,
    },
    contact: String,
    message: { type: String, required: true },
    status: { type: String, default: "open" },
  },
  { timestamps: true }
);

const SupportRequest =
  mongoose.models.SupportRequest ||
  mongoose.model("SupportRequest", SupportRequestSchema);

/* ------------------ SUPPORT ROUTE ------------------ */
app.post("/api/support", authRequired, async (req, res) => {
  try {
    const {
      subject,
      requestType,
      requestFollowUp,
      changeAccount,
      message,
      contact,
    } = req.body || {};

    if (!requestType) {
      return res.status(400).json({ message: "Request type is required." });
    }

    if (requestType === "Other" && !requestFollowUp) {
      return res.status(400).json({ message: "Please specify your request." });
    }

    if (requestType === "Change of account") {
      if (
        !changeAccount?.currentAccountType ||
        !changeAccount?.newAccountType
      ) {
        return res.status(400).json({ message: "Select both account types." });
      }

      if (
        changeAccount.currentAccountType ===
        changeAccount.newAccountType
      ) {
        return res.status(400).json({
          message: "Cannot change to the same account type.",
        });
      }
    }

    if (!message) {
      return res.status(400).json({ message: "Message is required." });
    }

    const user = await User.findById(req.user.userId);

    const saved = await SupportRequest.create({
      userId: user._id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      subject: subject || "Maths",
      requestType,
      requestFollowUp: requestType === "Other" ? requestFollowUp : "",
      changeAccount:
        requestType === "Change of account" ? changeAccount : null,
      contact,
      message,
    });

    return res.status(201).json({
      message: "Support request submitted successfully.",
      id: saved._id,
    });
  } catch (err) {
    console.error("Support error:", err.message);
    return res.status(500).json({ message: "Failed to submit request." });
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
    setInterval(autoPublishScheduledQuizzes, 60 * 1000);
    app.listen(PORT, () => console.log(`Server running on ${PORT}`));
  })
  .catch((err) => console.error("Mongo error:", err.message));
