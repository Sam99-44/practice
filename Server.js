// server.js (FULL UPDATED - COPY & PASTE)
// ✅ Student register: accountType + 8-digit studentNumber
// ✅ Register saves: province, cellphone, guardianCellphone (optional)
// ✅ Login: /api/login
// ✅ Profile: GET /api/auth/me (includes new fields)
// ✅ Admin stats: GET /api/admin/stats
// ✅ Quizzes: GET /api/quizzes (learner grade), POST /api/quizzes (admin) + ✅ Email notification to students by grade
// ✅ Quiz by id: GET /api/quizzes/:id
// ✅ Quiz update/delete (admin): PUT /api/quizzes/:id, DELETE /api/quizzes/:id
// ✅ Results: POST /api/results, GET /api/results/my, GET /api/results/:id
// ✅ Password reset (OTP): /api/forgot-password-otp + /api/reset-password-otp
// ✅ SendGrid: welcome email + test-email + health + quiz notification

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

// ✅ Website URL used in email links (set this on Render)
const SITE_URL = (process.env.SITE_URL || process.env.APP_URL || "https://practiceonline.co.za").trim();

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

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeTitle(s) {
  const t = cleanSpaces(s);
  return t || "Assessment";
}

function siteLink(pathOrUrl) {
  const s = String(pathOrUrl || "").trim();
  if (!s) return SITE_URL;
  if (/^https?:\/\//i.test(s)) return s;
  const base = SITE_URL.replace(/\/+$/, "");
  const path = s.replace(/^\/+/, "");
  return `${base}/${path}`;
}

/* ------------------ EMAIL TEMPLATES ------------------ */

// ✅ Welcome email: username NOT bold
function welcomeEmailStudent({ username, studentNumber }) {
  const u = cleanSpaces(username);
  const sn = cleanSpaces(studentNumber);

  const subject = `Welcome to Practice Online, ${u}`;
  const text =
    `Welcome to Practice Online, ${u}\n` +
    `Your student number is: ${sn}\n` +
    `Login here: ${siteLink("login.html")}\n`;

  const html = `
  <div style="margin:0; padding:0; background:#f6f7fb;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f6f7fb; padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600"
            style="max-width:600px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e6e6e6;">
            <tr>
              <td style="padding:18px 20px; background:#1b1648;">
                <div style="font-family:Arial, sans-serif; color:#ffffff; font-size:18px; font-weight:800;">
                  Practice Online
                </div>
                <div style="font-family:Arial, sans-serif; color:#cbd5f5; font-size:12px; margin-top:6px;">
                  Welcome
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 20px; font-family:Arial, sans-serif; color:#0f172a;">
                <h2 style="margin:0 0 10px; font-size:20px; line-height:1.3;">Welcome to Practice Online</h2>

                <p style="margin:0 0 14px; font-size:14px; line-height:1.6; color:#475569;">
                  Welcome, ${escapeHtml(u)}. Your account has been created successfully.
                </p>

                <div style="border:1px solid #e6e6e6; border-radius:14px; padding:14px; background:#fafbff;">
                  <div style="font-size:12px; color:#64748b; margin-bottom:6px;">Your student number</div>
                  <div style="font-size:22px; font-weight:800; color:#0f172a; letter-spacing:1px;">${escapeHtml(sn)}</div>
                </div>

                <div style="margin-top:18px;">
                  <a href="${siteLink("login.html")}" target="_blank" rel="noopener"
                    style="display:inline-block; background:#e11d2e; color:#ffffff; text-decoration:none; font-weight:800; padding:12px 16px; border-radius:12px; font-size:14px;">
                    Login
                  </a>
                </div>

                <p style="margin:16px 0 0; font-size:12px; color:#64748b; line-height:1.6;">
                  Regards,<br/>
                  <b>Practice Online Team</b>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;
  return { subject, text, html };
}

function welcomeEmailMaterials({ username }) {
  const u = cleanSpaces(username);
  const subject = `Welcome to Practice Online, ${u}`;
  const text =
    `Welcome to Practice Online, ${u}\n` +
    `You registered for Access Materials Only.\n` +
    `Login here: ${siteLink("login.html")}\n`;

  const html = `
  <div style="margin:0; padding:0; background:#f6f7fb;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f6f7fb; padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600"
            style="max-width:600px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e6e6e6;">
            <tr>
              <td style="padding:18px 20px; background:#1b1648;">
                <div style="font-family:Arial, sans-serif; color:#ffffff; font-size:18px; font-weight:800;">
                  Practice Online
                </div>
                <div style="font-family:Arial, sans-serif; color:#cbd5f5; font-size:12px; margin-top:6px;">
                  Welcome
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 20px; font-family:Arial, sans-serif; color:#0f172a;">
                <h2 style="margin:0 0 10px; font-size:20px; line-height:1.3;">Welcome to Practice Online</h2>

                <p style="margin:0 0 14px; font-size:14px; line-height:1.6; color:#475569;">
                  Welcome, ${escapeHtml(u)}. Your account has been created successfully.
                </p>

                <div style="border:1px solid #e6e6e6; border-radius:14px; padding:14px; background:#fafbff;">
                  <div style="font-size:12px; color:#64748b; margin-bottom:6px;">Account type</div>
                  <div style="font-size:16px; font-weight:800; color:#0f172a;">Access Materials Only</div>
                </div>

                <div style="margin-top:18px;">
                  <a href="${siteLink("login.html")}" target="_blank" rel="noopener"
                    style="display:inline-block; background:#e11d2e; color:#ffffff; text-decoration:none; font-weight:800; padding:12px 16px; border-radius:12px; font-size:14px;">
                    Login
                  </a>
                </div>

                <p style="margin:16px 0 0; font-size:12px; color:#64748b; line-height:1.6;">
                  Regards,<br/>
                  <b>Practice Online Team</b>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;
  return { subject, text, html };
}

// ✅ Quiz notification email (grade + questions + Start button)
function newQuizEmail({ grade, quizId, title, topic, timeLimitMinutes, questionsCount }) {
  const g = Number(grade);
  const quizTitle = safeTitle(title);
  const quizTopic = safeTitle(topic);
  const qCount = Number(questionsCount) || 0;

  const target = `attempt.html?quizId=${encodeURIComponent(String(quizId))}`;
  const link = siteLink(`login.html?next=${encodeURIComponent(target)}`);

  const subject = `Grade ${g}: New Assessment — ${quizTopic}`;

  const text =
    `Practice Online: New assessment for Grade ${g}\n` +
    `Title: ${quizTitle}\n` +
    `Topic: ${quizTopic}\n` +
    `Questions: ${qCount}\n` +
    (timeLimitMinutes ? `Time limit: ${Number(timeLimitMinutes)} minutes\n` : "") +
    `Start: ${link}\n`;

  const html = `
  <div style="margin:0; padding:0; background:#f6f7fb;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f6f7fb; padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600"
            style="max-width:600px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e6e6e6;">
            
            <tr>
              <td style="padding:18px 20px; background:#1b1648;">
                <div style="font-family:Arial, sans-serif; color:#ffffff; font-size:18px; font-weight:800;">
                  Practice Online
                </div>
                <div style="font-family:Arial, sans-serif; color:#cbd5f5; font-size:12px; margin-top:6px;">
                  New assessment available
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 20px; font-family:Arial, sans-serif; color:#0f172a;">
                <h2 style="margin:0 0 10px; font-size:20px; line-height:1.3;">
                  New assessment for Grade ${g} 🎯
                </h2>

                <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#475569;">
                  A new assessment has been added. Click the button below to start.
                </p>

                <div style="border:1px solid #e6e6e6; border-radius:14px; padding:14px; background:#fafbff;">
                  <div style="font-size:12px; color:#64748b; margin-bottom:6px;">Assessment details</div>

                  <div style="font-size:16px; font-weight:800; color:#0f172a; margin-bottom:8px;">
                    ${escapeHtml(quizTitle)}
                  </div>

                  <div style="font-size:13px; color:#475569; line-height:1.6;">
                    <div><b>Topic:</b> ${escapeHtml(quizTopic)}</div>
                    <div><b>Questions:</b> ${qCount}</div>
                    ${timeLimitMinutes ? `<div><b>Time limit:</b> ${Number(timeLimitMinutes)} minutes</div>` : ""}
                  </div>
                </div>

                <div style="margin-top:18px;">
                  <a href="${link}" target="_blank" rel="noopener"
                    style="display:inline-block; background:#e11d2e; color:#ffffff; text-decoration:none; font-weight:800; padding:12px 16px; border-radius:12px; font-size:14px;">
                    Start Assessment
                  </a>
                </div>

                <p style="margin:16px 0 0; font-size:12px; color:#64748b; line-height:1.6;">
                  If the button doesn’t work, copy and paste this link:<br/>
                  <span style="color:#1b1648;">${link}</span>
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 20px; background:#f8fafc; font-family:Arial, sans-serif; color:#64748b; font-size:12px; line-height:1.6;">
                Regards,<br/>
                <b>Practice Online Team</b><br/>
                <span style="color:#94a3b8;">You received this email because you have a student account for Grade ${g} on Practice Online.</span>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </div>
  `;

  return { subject, text, html, link };
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
    const studentNumber = accountType === "student" ? await generateStudentNumber8() : null;

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

    // ✅ nicer welcome emails (username NOT bold)
    if (user.accountType === "student") {
      const { subject, text, html } = welcomeEmailStudent({
        username: user.username,
        studentNumber: user.studentNumber,
      });
      await sendEmail({ to: user.email, subject, text, html });
    } else {
      const { subject, text, html } = welcomeEmailMaterials({ username: user.username });
      await sendEmail({ to: user.email, subject, text, html });
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

// Admin creates quiz (admin-quiz.html POSTs here)
// ✅ NOW: sends email to students in that grade
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
      instructions: "",
      isFrozen: false,
      frozenAt: null,
      availableFrom: null,
      availableUntil: null,
    });

    // ✅ respond immediately (fast UX)
    res.status(201).json({ message: "Saved", quizId: quiz._id });

    // ✅ send emails in background (does NOT block the admin)
    setImmediate(async () => {
      try {
        // Only email STUDENT accounts that match the grade
        const students = await User.find({
          role: "learner",
          accountType: "student",
          grade: g,
          email: { $exists: true, $ne: "" },
        }).select("email username");

        if (!students.length) {
          console.log(`[QUIZ EMAIL] No students found for Grade ${g}`);
          return;
        }

        const { subject, html, text } = newQuizEmail({
          grade: g,
          quizId: quiz._id,
          title: quiz.title,
          topic: quiz.topic,
          timeLimitMinutes: quiz.timeLimitMinutes,
          questionsCount: Array.isArray(quiz.questions) ? quiz.questions.length : 0,
        });

        // ✅ send one-by-one (simple + reliable)
        let okCount = 0;
        for (const st of students) {
          try {
            await sendEmail({ to: st.email, subject, html, text });
            okCount += 1;
          } catch (e) {
            console.error("[QUIZ EMAIL] Failed:", st.email, e.message);
          }
        }

        console.log(`[QUIZ EMAIL] Sent ${okCount}/${students.length} emails for Grade ${g} (quiz ${quiz._id})`);
      } catch (e) {
        console.error("[QUIZ EMAIL] Error:", e.message);
      }
    });
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

    await sendEmail({
      to: user.email,
      subject: "Password reset code",
      text: `Your reset code is: ${otp}. It expires in 10 minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif; padding:18px;">
          <h2 style="margin:0 0 10px;">Password Reset Code</h2>
          <p style="margin:0 0 12px;">Your reset code is:</p>
          <div style="font-size:28px; font-weight:800; letter-spacing:3px;">${otp}</div>
          <p style="margin:12px 0 0; color:#475569;">This code expires in <b>10 minutes</b>.</p>
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
