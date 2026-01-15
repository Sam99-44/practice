// Server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import Quiz from "./models/Quiz.js";
import User from "./models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import crypto from "crypto";
import { getTransporter, verifySmtp } from "./utils/mailer.js";

// ✅ PayFast routes (your current folder structure: routes/routes/payfast.js)
import payfastRoutes from "./routes/routes/payfast.js";

dotenv.config();

const app = express();

/* ------------------ CORS ------------------ */
const ALLOWED_ORIGINS = [
  process.env.APP_URL,
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true
  })
);

/* ------------------ BODY PARSERS ------------------ */
// JSON for normal API
app.use(express.json());

// ✅ PayFast ITN is usually "application/x-www-form-urlencoded"
app.use(express.urlencoded({ extended: false }));

/* ------------------ ROUTES ------------------ */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/", (req, res) => res.send("Practice Online API running"));

/* ------------------ HELPERS ------------------ */
function smtpReady() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.APP_URL
  );
}

/* ------------------ AUTH MIDDLEWARE ------------------ */
function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, username }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

async function adminOnly(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select("role");
    if (!user) return res.status(401).json({ message: "User not found" });
    if (user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function premiumRequired(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select(
      "role premium premiumExpiresAt premiumActivatedAt"
    );
    if (!user) return res.status(401).json({ message: "User not found" });

    // ✅ Admin never pays
    if (user.role === "admin") return next();

    const now = new Date();

    // ✅ auto-expire premium
    if (user.premium && user.premiumExpiresAt && user.premiumExpiresAt <= now) {
      user.premium = false;
      user.premiumActivatedAt = null;
      user.premiumExpiresAt = null;
      await user.save();
    }

    if (!user.premium) {
      return res.status(403).json({
        message: "Premium required. Please pay R95 to access content."
      });
    }

    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

/* ------------------ AUTH ROUTES ------------------ */

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, grade, password } = req.body;

    if (!username || !email || !grade || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const g = Number(grade);

    if (!Number.isFinite(g) || g < 8 || g > 12) {
      return res.status(400).json({ message: "Grade must be 8–12" });
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
    if (!emailOk) return res.status(400).json({ message: "Invalid email address" });

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be 6+ characters" });
    }

    if (await User.findOne({ username: cleanUsername })) {
      return res.status(409).json({ message: "Username already taken" });
    }

    if (await User.findOne({ email: cleanEmail })) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await User.create({
      username: cleanUsername,
      email: cleanEmail,
      grade: g,
      passwordHash
    });

    // optional welcome email
    if (smtpReady()) {
      try {
        const transporter = getTransporter();
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: cleanEmail,
          subject: "Welcome to Practice Online 🎉",
          text: `Hi ${cleanUsername},\n\nWelcome to Practice Online!\n\nLogin here:\n${process.env.APP_URL}/login.html\n\n— Practice Online Team`
        });
      } catch (e) {
        console.error("Welcome email failed:", e?.message || e);
      }
    }

    res.status(201).json({ message: "Account created" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username: (username || "").trim() });
    if (!user) return res.status(401).json({ message: "Invalid login" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid login" });

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Current user
app.get("/api/auth/me", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "username role email grade premium premiumActivatedAt premiumExpiresAt createdAt"
    );
    if (!user) return res.status(401).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ PAYFAST ROUTES ------------------ */
app.use("/api/payfast", payfastRoutes);

/* ------------------ QUIZ ROUTES ------------------ */

// ✅ premium-protected
app.get("/api/quizzes", authRequired, premiumRequired, async (req, res) => {
  try {
    const grade = Number(req.query.grade);
    const filter = Number.isFinite(grade) ? { grade } : {};
    const quizzes = await Quiz.find(filter).sort({ createdAt: -1 });
    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ premium-protected
app.get("/api/quizzes/:id", authRequired, premiumRequired, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    res.json(quiz);
  } catch {
    res.status(400).json({ message: "Invalid quiz id" });
  }
});

// ✅ admin only to create quizzes
app.post("/api/quizzes", authRequired, adminOnly, async (req, res) => {
  try {
    const quiz = await Quiz.create(req.body);
    res.status(201).json(quiz);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* ------------------ DATABASE + START ------------------ */
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");

    if (smtpReady()) {
      try {
        await verifySmtp();
        console.log("SMTP verified ✅");
      } catch (e) {
        console.error("SMTP verify failed ❌:", e?.message || e);
      }
    } else {
      console.log("SMTP not configured - emails disabled");
    }

    app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error("Mongo error:", err.message));
