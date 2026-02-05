// server.js (UPDATED - COPY & PASTE)
// ✅ No testMailRouter import
// ✅ /api/test-email route included
// ✅ Register does NOT fail if email fails (logs error)
// ✅ Uses SMTP (no-reply) via utils/mailer.js

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

/* ------------------- DEBUG ------------------- */
console.log("MONGO_URI:", process.env.MONGO_URI ? "LOADED ✅" : "MISSING ❌");
console.log("SMTP_HOST:", process.env.SMTP_HOST ? "LOADED ✅" : "MISSING ❌");
console.log("SMTP_PORT:", process.env.SMTP_PORT ? "LOADED ✅" : "MISSING ❌");
console.log("SMTP_USER:", process.env.SMTP_USER ? "LOADED ✅" : "MISSING ❌");
console.log("MAIL_FROM_EMAIL:", process.env.MAIL_FROM_EMAIL ? "LOADED ✅" : "MISSING ❌");

/* ------------------- EMAIL HELPER ------------------- */
async function sendEmail({ to, subject, html }) {
  const transporter = getTransporter();
  const fromName = process.env.MAIL_FROM_NAME || "Practice Online";
  const fromEmail = process.env.MAIL_FROM_EMAIL;

  if (!fromEmail) throw new Error("MAIL_FROM_EMAIL missing");

  return transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
  });
}

/* ------------------- HELPERS ------------------- */
function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function cleanSpaces(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
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

/* ------------------- ROUTES ------------------- */
app.get("/", (req, res) => res.send("Practice Online API running"));

/* ✅ TEST EMAIL */
app.get("/api/test-email", async (req, res) => {
  const to = String(req.query.to || "info@practiceonline.co.za").trim();
  try {
    await sendEmail({
      to,
      subject: "Practice Online ✅ SMTP Test",
      html: `
        <h2>SMTP Test Successful ✅</h2>
        <p>This confirms your Practice Online email is working.</p>
        <p><b>Time:</b> ${new Date().toLocaleString()}</p>
      `,
    });
    res.send("Email sent successfully to " + to);
  } catch (e) {
    console.error("TEST EMAIL ERROR:", e?.message || e);
    res.status(500).send("Email failed: " + (e?.message || "unknown"));
  }
});

/* -------- REGISTER -------- */
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password, grade, accountType } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const exists = await User.findOne({ email: cleanEmail });
    if (exists) return res.status(409).json({ message: "Email exists" });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username: cleanSpaces(username),
      email: cleanEmail,
      passwordHash,
      grade: grade ? Number(grade) : null,
      role: "learner",
      accountType: accountType || "student",
    });

    // ✅ Email should NOT block registration
    try {
      await sendEmail({
        to: user.email,
        subject: "Welcome to Practice Online",
        html: `<h2>Welcome ${user.username}</h2><p>Your account is ready.</p>`,
      });
      console.log("WELCOME EMAIL SENT ✅ to", user.email);
    } catch (e) {
      console.error("WELCOME EMAIL FAILED ❌:", e?.message || e);
    }

    return res.status(201).json({ message: "Registered successfully" });
  } catch (e) {
    console.error("REGISTER ERROR:", e?.message || e);
    return res.status(500).json({ message: "Server error" });
  }
});

/* -------- LOGIN -------- */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const cleanEmail = String(email).toLowerCase().trim();
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

    try {
      await sendEmail({
        to: cleanEmail,
        subject: "Password Reset Code",
        html: `<h2>Your code: ${otp}</h2><p>Expires in 10 minutes.</p>`,
      });
      console.log("RESET OTP EMAIL SENT ✅ to", cleanEmail);
    } catch (e) {
      console.error("RESET OTP EMAIL FAILED ❌:", e?.message || e);
    }

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

/* ------------------- OPTIONAL 404 FOR API ------------------- */
app.use("/api", (req, res) => res.status(404).json({ message: "API route not found" }));

/* ------------------- START ------------------- */
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected ✅");
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Test email: http://localhost:${PORT}/api/test-email`);
    });
  })
  .catch((err) => console.error("Mongo error:", err.message));
