// Server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import Quiz from "./models/Quiz.js";
import User from "./models/User.js";
import payfastRoutes from "./routes/payfast.js";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { verifySmtp } from "./utils/mailer.js";

dotenv.config();

const app = express();

/* ------------------ MIDDLEWARE ------------------ */

// CORS
const ALLOWED_ORIGINS = [
  process.env.APP_URL, // https://practiceonline.netlify.app
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

// Needed for PayFast ITN
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

/* ------------------ ROUTES ------------------ */

// PayFast routes (VERY IMPORTANT)
app.use("/api/payfast", payfastRoutes);

/* ------------------ HEALTH ------------------ */

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.send("Practice Online API running");
});

/* ------------------ AUTH HELPERS ------------------ */

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
  const user = await User.findById(req.user.userId).select("role");
  if (!user) return res.status(401).json({ message: "User not found" });
  if (user.role !== "admin") return res.status(403).json({ message: "Admin only" });
  next();
}

async function premiumRequired(req, res, next) {
  const user = await User.findById(req.user.userId).select(
    "role premium premiumExpiresAt premiumActivatedAt"
  );

  if (!user) return res.status(401).json({ message: "User not found" });

  // Admin never pays
  if (user.role === "admin") return next();

  const now = new Date();

  // Auto-expire premium
  if (user.premium && user.premiumExpiresAt && user.premiumExpiresAt <= now) {
    user.premium = false;
    user.premiumActivatedAt = null;
    user.premiumExpiresAt = null;
    await user.save();
  }

  if (!user.premium) {
    return res.status(403).json({
      message: "Premium required. Please pay R95 to continue."
    });
  }

  next();
}

/* ------------------ AUTH ROUTES ------------------ */

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, grade, password } = req.body;

    if (!username || !email || !grade || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be 6+ characters" });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = username.trim();
    const g = Number(grade);

    if (!Number.isFinite(g) || g < 8 || g > 12) {
      return res.status(400).json({ message: "Grade must be between 8 and 12" });
    }

    if (await User.findOne({ username: cleanUsername }))
      return res.status(409).json({ message: "Username already taken" });

    if (await User.findOne({ email: cleanEmail }))
      return res.status(409).json({ message: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);

    await User.create({
      username: cleanUsername,
      email: cleanEmail,
      grade: g,
      passwordHash
    });

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
  const user = await User.findById(req.user.userId).select(
    "username email role grade premium premiumActivatedAt premiumExpiresAt createdAt"
  );

  if (!user) return res.status(401).json({ message: "User not found" });
  res.json(user);
});

/* ------------------ QUIZ ROUTES ------------------ */

app.get("/api/quizzes", authRequired, premiumRequired, async (req, res) => {
  const grade = Number(req.query.grade);
  const filter = Number.isFinite(grade) ? { grade } : {};
  const quizzes = await Quiz.find(filter).sort({ createdAt: -1 });
  res.json(quizzes);
});

app.get("/api/quizzes/:id", authRequired, premiumRequired, async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });
  res.json(quiz);
});

app.post("/api/quizzes", authRequired, adminOnly, async (req, res) => {
  const quiz = await Quiz.create(req.body);
  res.status(201).json(quiz);
});

/* ------------------ DATABASE + START ------------------ */

const PORT = process.env.PORT || 10000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");

    try {
      await verifySmtp();
      console.log("SMTP verified ✅");
    } catch {
      console.log("SMTP not configured / skipped");
    }

    app.listen(PORT, () =>
      console.log(`Server running on port ${PORT}`)
    );
  })
  .catch((err) => console.error("Mongo error:", err.message));
