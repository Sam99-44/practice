// server.js (FULL UPDATED - COPY & PASTE)
// ✅ Student register: accountType + 8-digit studentNumber
// ✅ Register saves: province, cellphone, guardianCellphone (optional)
// ✅ Login: /api/login
// ✅ Profile: GET /api/auth/me (includes new fields)
// ✅ Admin stats: GET /api/admin/stats
// ✅ Quizzes: GET /api/quizzes (learner grade), POST /api/quizzes (admin) ✅ EMAIL students by grade
// ✅ Quiz by id: GET /api/quizzes/:id
// ✅ Quiz update/delete (admin): PUT /api/quizzes/:id, DELETE /api/quizzes/:id
// ✅ Results: POST /api/results, GET /api/results/my, GET /api/results/:id
// ✅ Password reset (OTP): /api/forgot-password-otp + /api/reset-password-otp
// ✅ SendGrid: welcome email + test-email + health
// ✅ NEW: Quiz instructions saved from admin + stored in Result for review page
// ✅ NEW: Professional email layout (welcome + quiz notify + reset)

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

/* ------------------ EMAIL TEMPLATES ------------------ */
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function emailLayout({ title, intro, bodyHtml, ctaText, ctaUrl, footerNote }) {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro || "");
  const safeFooter = escapeHtml(footerNote || "Practice Online");
  const year = new Date().getFullYear();

  const button =
    ctaText && ctaUrl
      ? `<a href="${ctaUrl}" style="display:inline-block;background:#e11d2e;color:#fff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:700;">${escapeHtml(
          ctaText
        )}</a>`
      : "";

  return `
  <div style="background:#f6f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e6e6e6;border-radius:14px;overflow:hidden;">
      <div style="padding:18px 18px;background:#1b1648;color:#ffffff;">
        <div style="font-size:16px;font-weight:800;letter-spacing:.3px;">Practice Online</div>
        <div style="opacity:.85;font-size:13px;margin-top:4px;">Grades 8–12 Practice</div>
      </div>

      <div style="padding:18px 18px;">
        <h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;">${safeTitle}</h2>
        ${
          intro
            ? `<p style="margin:0 0 12px;color:#334155;line-height:1.65;font-size:14px;">${safeIntro}</p>`
            : ""
        }

        ${bodyHtml || ""}

        ${button ? `<div style="margin-top:16px;">${button}</div>` : ""}

        <hr style="border:none;border-top:1px solid #eef2f7;margin:18px 0;">

        <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">
          If you did not request this, you can ignore this email.
        </p>
      </div>

      <div style="padding:14px 18px;background:#f8fafc;border-top:1px solid #eef2f7;color:#64748b;font-size:12px;line-height:1.6;">
        © ${year} ${safeFooter}. All rights reserved.
      </div>
    </div>
  </div>`;
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
      if (!origin) return cb(null, true); // Postman/curl
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      if (origin.endsWith(".netlify.app")) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: true,
  })
);

// Preflight
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
      subject: "Practice Online test email",
      text: "Email sending works.",
      html: emailLayout({
        title: "Test email",
        intro: "This is a test email to confirm delivery.",
        bodyHtml: `<p style="margin:0;color:#334155;line-height:1.65;font-size:14px;">If you received this email, your SendGrid setup is working.</p>`,
        footerNote: "Practice Online",
      }),
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

// Profile endpoint used by learner-quizzes.html + admin pages
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

      // ✅ optional fields
      province: cleanSpaces(province || ""),
      cellphone: cleanSpaces(cellphone || ""),
      guardianCellphone: cleanSpaces(guardianCellphone || ""),

      emailVerified: true,
      verifyTokenHash: null,
      verifyTokenExpiresAt: null,
    });

    const loginUrl = "https://practiceonline.co.za/login.html";

    if (user.accountType === "student") {
      await sendEmail({
        to: user.email,
        subject: `Welcome to Practice Online`,
        text: `Welcome ${user.username}. Your student number is ${user.studentNumber}. Login: ${loginUrl}`,
        html: emailLayout({
          title: "Welcome to Practice Online",
          intro: `Hi ${user.username}, your account has been created successfully.`,
          bodyHtml: `
            <p style="margin:0 0 10px;color:#334155;line-height:1.65;font-size:14px;">
              Your student number is:
            </p>
            <div style="display:inline-block;padding:10px 12px;border:1px solid #e6e6e6;border-radius:10px;background:#f8fafc;font-weight:800;letter-spacing:1px;">
              ${escapeHtml(user.studentNumber)}
            </div>
            <p style="margin:12px 0 0;color:#334155;line-height:1.65;font-size:14px;">
              You can log in anytime to start practising.
            </p>
          `,
          ctaText: "Log in",
          ctaUrl: loginUrl,
          footerNote: "Practice Online",
        }),
      });
    } else {
      await sendEmail({
        to: user.email,
        subject: `Welcome to Practice Online`,
        text: `Welcome ${user.username}. Your account is ready. Login: ${loginUrl}`,
        html: emailLayout({
          title: "Welcome to Practice Online",
          intro: `Hi ${user.username}, your account has been created successfully.`,
          bodyHtml: `
            <p style="margin:0;color:#334155;line-height:1.65;font-size:14px;">
              You registered for Access Materials Only.
            </p>
            <p style="margin:12px 0 0;color:#334155;line-height:1.65;font-size:14px;">
              Log in to access available learning materials.
            </p>
          `,
          ctaText: "Log in",
          ctaUrl: loginUrl,
          footerNote: "Practice Online",
        }),
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

    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

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
        "grade title topic questions timeLimitMinutes instructions isFrozen availableFrom availableUntil createdAt updatedAt frozenAt"
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

// Admin creates quiz (admin-quiz.html POSTs here) ✅ NOW EMAILS STUDENTS BY GRADE
app.post("/api/quizzes", authRequired, adminOnly, async (req, res) => {
  try {
    const { grade, title, topic, timeLimitMinutes, instructions, questions } = req.body;

    if (!grade || !title || !topic || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: "Grade, topic, title, and questions are required." });
    }

    const g = Number(grade);
    if (!Number.isInteger(g) || g < 8 || g > 12) {
      return res.status(400).json({ message: "Grade must be between 8 and 12." });
    }

    const quizTitle = cleanSpaces(title);
    const quizTopic = cleanSpaces(topic);
    const quizInstructions = String(instructions || "").trim();

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

    // ✅ return immediately (admin page stays fast)
    res.status(201).json({ message: "Saved", quizId: quiz._id });

    // ✅ send emails after response (background)
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

        const subject = `New assessment available (Grade ${g})`;
        const link =
          "https://practiceonline.co.za/login.html?next=" +
          encodeURIComponent("learner-quizzes.html");

        const html = emailLayout({
          title: "New assessment available",
          intro: `A new Grade ${g} assessment has been added.`,
          bodyHtml: `
            <p style="margin:0 0 10px;color:#334155;line-height:1.65;font-size:14px;">
              <span style="font-weight:800;">${escapeHtml(quizTitle)}</span><br>
              Topic: ${escapeHtml(quizTopic)}
            </p>
            ${
              quizInstructions
                ? `<p style="margin:0 0 10px;color:#334155;line-height:1.65;font-size:14px;">
                    Instructions: ${escapeHtml(quizInstructions)}
                  </p>`
                : ""
            }
            <p style="margin:0;color:#334155;line-height:1.65;font-size:14px;">
              Log in to view and attempt the assessment.
            </p>
          `,
          ctaText: "Open assessments",
          ctaUrl: link,
          footerNote: "Practice Online",
        });

        const text = `New Grade ${g} assessment: ${quizTitle} (${quizTopic}). Login: ${link}`;

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

// Admin updates quiz (edit-assessment.html PUTs here)
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

    // Validation + cleaning
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

      // light validation for question objects
      for (const q of update.questions) {
        const type = String(q?.type || "mcq").toLowerCase();
        if (!cleanSpaces(q?.text)) {
          return res.status(400).json({ message: "Each question must have text." });
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
          if (opts.length !== 4 || opts.some((o) => !cleanSpaces(o))) {
            return res.status(400).json({ message: "MCQ questions must have 4 options A–D." });
          }
          const ci = Number(q?.correctIndex);
          if (!Number.isInteger(ci) || ci < 0 || ci > 3) {
            return res.status(400).json({ message: "MCQ correctIndex must be 0–3." });
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

function compareTextAnswer(userAns, correctAns, mode, tolerance) {
  const uaRaw = cleanSpaces(userAns);
  const caRaw = cleanSpaces(correctAns);
  if (!caRaw) return false;

  const ua = uaRaw.toLowerCase();
  const ca = caRaw.toLowerCase();

  if (mode === "contains") return ua.includes(ca);

  if (mode === "number_tolerance") {
    const uNum = Number(ua);
    const cNum = Number(ca);
    const tol = Number(tolerance);
    if (!Number.isFinite(uNum) || !Number.isFinite(cNum) || !Number.isFinite(tol)) return false;
    return Math.abs(uNum - cNum) <= tol;
  }

  return ua === ca; // exact
}

// Submit attempt (attempt.html POSTs here)
app.post("/api/results", authRequired, async (req, res) => {
  try {
    const { quizId, answers, timeTakenSeconds } = req.body;

    if (!quizId || !Array.isArray(answers)) {
      return res.status(400).json({ message: "quizId and answers are required." });
    }

    const userId = req.user.userId;

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

      // ✅ NEW: snapshot quiz instructions for review page
      instructions: String(quiz.instructions || "").trim(),

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
  } catch {
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

    const resetNote = "This code expires in 10 minutes.";

    await sendEmail({
      to: user.email,
      subject: "Password reset code",
      text: `Your reset code is ${otp}. ${resetNote}`,
      html: emailLayout({
        title: "Password reset code",
        intro: "Use the code below to reset your password.",
        bodyHtml: `
          <p style="margin:0 0 10px;color:#334155;line-height:1.65;font-size:14px;">
            Your reset code is:
          </p>
          <div style="display:inline-block;padding:12px 14px;border:1px solid #e6e6e6;border-radius:10px;background:#f8fafc;font-weight:900;letter-spacing:3px;font-size:18px;">
            ${escapeHtml(otp)}
          </div>
          <p style="margin:12px 0 0;color:#334155;line-height:1.65;font-size:14px;">
            ${escapeHtml(resetNote)}
          </p>
        `,
        footerNote: "Practice Online",
      }),
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
