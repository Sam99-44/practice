// server.js (PRODUCTION SAFE - COPY & PASTE)
// ✅ NO testMail import
// ✅ Register supports: accountType + grade (student) + studentNumber (auto)
// ✅ Welcome email uses your cPanel SMTP via mailer.js (but will NOT block register if email fails)

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

/* ------------------- HELPERS ------------------- */
function cleanSpaces(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 8-digit student number
async function generateStudentNumber8() {
  while (true) {
    const num = String(Math.floor(10000000 + Math.random() * 90000000));
    const exists = await User.findOne({ studentNumber: num }).select("_id");
    if (!exists) return num;
  }
}

/* ------------------- EMAIL ------------------- */
async function sendEmail({ to, subject, html }) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_EMAIL}>`,
    to,
    subject,
    html,
  });
}

/* ------------------- AUTH MIDDLEWARE ------------------- */
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
  try {
    const u = await User.findById(req.user.userId).select("role");
    if (!u) return res.status(401).json({ message: "User not found" });
    if (u.role !== "admin") return res.status(403).json({ message: "Admin only" });
    next();
  } catch {
    res.status(500).json({ message: "Server error" });
  }
}

/* ------------------- ROUTES ------------------- */
app.get("/", (req, res) => res.send("Practice Online API running"));

/* -------- REGISTER -------- */
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password, accountType, grade } = req.body;

    const cleanUsername = cleanSpaces(username);
    const cleanEmail = String(email || "").toLowerCase().trim();
    const type = String(accountType || "").toLowerCase().trim();

    if (!cleanUsername || !cleanEmail || !password || !type) {
      return res.status(400).json({
        message: "username, email, password, and accountType are required.",
      });
    }

    if (!["student", "materials"].includes(type)) {
      return res.status(400).json({ message: "Invalid accountType." });
    }

    let gradeNum = null;
    if (type === "student") {
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

    const exists = await User.findOne({ email: cleanEmail }).select("_id");
    if (exists) return res.status(409).json({ message: "Email already registered." });

    const passwordHash = await bcrypt.hash(password, 10);

    const studentNumber = type === "student" ? await generateStudentNumber8() : null;

    const user = await User.create({
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      role: "learner",
      accountType: type,
      grade: gradeNum,
      studentNumber,
    });

    // ✅ Welcome email (DO NOT block register if email fails)
    try {
      await sendEmail({
        to: user.email,
        subject: "Welcome to Practice Online",
        html:
          type === "student"
            ? `<h2>Welcome ${user.username}</h2>
               <p>Your student number is <b>${user.studentNumber}</b>.</p>
               <p>Login and start practicing.</p>`
            : `<h2>Welcome ${user.username}</h2>
               <p>You registered for <b>Access Materials Only</b>.</p>
               <p>Login and explore.</p>`,
      });
    } catch (e) {
      console.error("WELCOME EMAIL FAILED:", e?.message || e);
    }

    return res.status(201).json({
      message: "Registered successfully",
      accountType: user.accountType,
      studentNumber: user.studentNumber,
    });
  } catch (e) {
    // ✅ Make the error visible in Render logs
    console.error("REGISTER ERROR:", e);

    // Common Mongo duplicate key
    if (String(e?.code) === "11000") {
      return res.status(409).json({ message: "Duplicate value (email/username already exists)." });
    }

    // Common Mongoose validation error
    if (e?.name === "ValidationError") {
      return res.status(400).json({ message: e.message });
    }

    return res.status(500).json({ message: "Server error" });
  }
});

/* -------- LOGIN -------- */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const cleanEmail = String(email || "").toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(401).json({ message: "Invalid login" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid login" });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user });
  } catch (e) {
    console.error("LOGIN ERROR:", e?.message || e);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- FORGOT PASSWORD (OTP) -------- */
app.post("/api/forgot-password-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = String(email || "").toLowerCase().trim();
    if (!cleanEmail) return res.status(400).json({ message: "Email is required" });

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
  } catch (e) {
    console.error("FORGOT OTP ERROR:", e?.message || e);
    res.status(500).json({ message: "Server error" });
  }
});

/* -------- RESET PASSWORD (OTP) -------- */
app.post("/api/reset-password-otp", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    const cleanEmail = String(email || "").toLowerCase().trim();
    const cleanCode = String(code || "").trim();

    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(400).json({ message: "Invalid code" });

    const expired =
      !user.resetPasswordExpires || user.resetPasswordExpires.getTime() < Date.now();
    const match = user.resetPasswordTokenHash === hashToken(cleanCode);

    if (!match || expired) return res.status(400).json({ message: "Invalid or expired code" });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: "Password updated" });
  } catch (e) {
    console.error("RESET OTP ERROR:", e?.message || e);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------- 404 + ERROR HANDLER ------------------- */
app.use("/api", (req, res) => res.status(404).json({ message: "API route not found" }));

app.use((err, req, res, next) => {
  if (String(err?.message || "").startsWith("CORS blocked:")) {
    return res.status(403).json({ message: err.message });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Server error" });
});

/* ------------------- START ------------------- */
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected ✅");
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => console.error("Mongo error:", err.message));
