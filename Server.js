// server.js (UPDATED FOR MULTI-SELECT MCQ - COPY & PASTE)
// ✅ Backwards compatible:
//    - Single-answer MCQ: uses correctIndex + chosenIndex
//    - Multi-select MCQ: uses correctIndexes:[...] + chosenIndexes:[...]
// ✅ Scores multi-select like this (simple + fair):
//    - Full marks ONLY if chosen set matches correct set exactly
//    - Otherwise 0 (no partial marks)
// ✅ Validates multi-select MCQ on quiz create/update
// ✅ Saves result snapshot with chosenIndexes/correctIndexes for review page

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

function uniqIntArray(arr) {
  const a = Array.isArray(arr) ? arr : [];
  const out = [];
  for (const x of a) {
    const n = Number(x);
    if (Number.isInteger(n) && n >= 0) out.push(n);
  }
  return [...new Set(out)];
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
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
  } catch {
    res.status(500).json({ message: "Server error" });
  }
}

/* ------------------ AUTH ROUTES ------------------ */
app.get("/api/auth/me", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "username email role grade accountType studentNumber province cellphone guardianCellphone"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      username: user.username,
      email: user.email,
      role: user.role,
      grade: user.grade,
      accountType: user.accountType,
      studentNumber: user.studentNumber,
      province: user.province || "",
      cellphone: user.cellphone || "",
      guardianCellphone: user.guardianCellphone || "",
    });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

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
        "grade title topic questions timeLimitMinutes instructions isFrozen availableFrom availableUntil createdAt updatedAt frozenAt"
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

    if (u.role !== "admin" && Number(quiz.grade) !== Number(u.grade)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    return res.json(quiz);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ Helper: validate MCQ supports single or multi
function validateMcqBlock(q) {
  const opts = Array.isArray(q?.options) ? q.options : [];
  if (opts.length < 2 || opts.some((o) => !cleanSpaces(o))) {
    return { ok: false, message: "MCQ must have at least 2 options." };
  }

  const multiArr = uniqIntArray(q?.correctIndexes);

  // If correctIndexes provided AND has length >= 1 => treat as multi (even if length 1)
  if (Array.isArray(q?.correctIndexes)) {
    if (multiArr.length < 1) {
      return { ok: false, message: "MCQ correctIndexes must contain at least 1 index." };
    }
    if (multiArr.some((i) => i < 0 || i >= opts.length)) {
      return { ok: false, message: "MCQ correctIndexes must be within options." };
    }
    // normalize it back (keeps DB clean)
    q.correctIndexes = multiArr;
    // optional: remove single field to avoid confusion
    // q.correctIndex = undefined;
    return { ok: true };
  }

  // otherwise single-correct
  const ci = safeInt(q?.correctIndex, null);
  if (ci === null || ci < 0 || ci >= opts.length) {
    return { ok: false, message: "MCQ correctIndex must be within options." };
  }
  return { ok: true };
}

// Admin creates quiz
app.post("/api/quizzes", authRequired, adminOnly, async (req, res) => {
  try {
    const { grade, title, topic, timeLimitMinutes, instructions, questions } = req.body;

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

    // ✅ Validate blocks (mcq/text/note) + points + solution (optional) + multi-select mcq
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
          const tol = safeNum(q?.numberTolerance, null);
          if (tol === null || tol < 0) {
            return res.status(400).json({ message: "Invalid numberTolerance." });
          }
        }
      } else {
        const v = validateMcqBlock(q);
        if (!v.ok) return res.status(400).json({ message: v.message });
      }
    }

    const quiz = await Quiz.create({
      grade: g,
      title: quizTitle,
      topic: quizTopic,
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
            <p><a href="${link}" target="_blank">Log in to Practice Online</a></p>
            <p>Regards,<br/>Practice Online Team</p>
          </div>
        `;

        const text = `New assessment for Grade ${g}: ${quizTitle} (Topic: ${quizTopic}). Login: ${link}`;

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
      "instructions",
      "timeLimitMinutes",
      "availableFrom",
      "availableUntil",
      "questions",
      "isFrozen",
      "frozenAt",
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
          const v = validateMcqBlock(q);
          if (!v.ok) return res.status(400).json({ message: v.message });
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

// ✅ Determine correctness for MCQ (single OR multi)
function checkMcqCorrect({ quizQuestion, userAnswer }) {
  const opts = Array.isArray(quizQuestion.options) ? quizQuestion.options : [];

  // Multi if quizQuestion.correctIndexes is an array (preferred)
  if (Array.isArray(quizQuestion.correctIndexes)) {
    const correctArr = uniqIntArray(quizQuestion.correctIndexes).filter((i) => i < opts.length);
    const chosenArr = uniqIntArray(userAnswer?.chosenIndexes).filter((i) => i < opts.length);

    const correctSet = new Set(correctArr);
    const chosenSet = new Set(chosenArr);

    return {
      isMulti: true,
      isCorrect: correctArr.length > 0 && setsEqual(correctSet, chosenSet),
      chosenIndexes: chosenArr,
      correctIndexes: correctArr,
      chosenIndex: -1,
      correctIndex: -1,
    };
  }

  // Single (legacy)
  const chosenIndex = Number.isFinite(Number(userAnswer?.chosenIndex))
    ? Number(userAnswer.chosenIndex)
    : -1;

  const correctIndex = Number.isFinite(Number(quizQuestion?.correctIndex))
    ? Number(quizQuestion.correctIndex)
    : -1;

  return {
    isMulti: false,
    isCorrect: chosenIndex === correctIndex && correctIndex >= 0,
    chosenIndexes: [],
    correctIndexes: [],
    chosenIndex,
    correctIndex,
  };
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

          // legacy + multi fields (kept for consistent schema)
          chosenIndex: -1,
          correctIndex: -1,
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

      // ✅ MCQ (single OR multi)
      const chk = checkMcqCorrect({ quizQuestion: q, userAnswer: ans });
      const earned = chk.isCorrect ? qPoints : 0;
      scorePoints += earned;

      return {
        questionIndex: i,
        type: "mcq",
        points: qPoints,
        earnedPoints: earned,

        // legacy single
        chosenIndex: chk.chosenIndex,
        correctIndex: chk.correctIndex,

        // multi
        chosenIndexes: chk.chosenIndexes,
        correctIndexes: chk.correctIndexes,

        textAnswer: "",
        correctText: "",
        hint,
        solution,
        answerMode: "case-insensitive",
        tolerance: null,
        roundTo: null,
        isCorrect: chk.isCorrect,
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

app.get("/api/results/my", authRequired, async (req, res) => {
  try {
    const userId = req.user.userId;

    const rows = await Result.find({ userId })
      .sort({ createdAt: -1 })
      .select("_id createdAt grade topic title percent score total status quizId attemptNo isAdminAttempt");

    return res.json(rows);
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

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
1) Your Quiz model should allow these fields on MCQ questions:
   - correctIndex (Number)  // legacy single
   - correctIndexes ([Number]) // new multi-select

2) Your Result model (answers subdocument) should allow:
   - chosenIndex, correctIndex (Number)
   - chosenIndexes, correctIndexes ([Number])

If you want, paste your models/Quiz.js + models/Result.js and I’ll update them too.
*/
