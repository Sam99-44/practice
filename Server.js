// Server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import Quiz from "./models/Quiz.js";
import User from "./models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();

/* ------------------ CORS ------------------ */
const ALLOWED_ORIGINS = [
  process.env.APP_URL, // e.g. https://practiceonline.netlify.app
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

app.use(express.json());

/* ------------------ HEALTH ------------------ */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/", (req, res) => res.send("Practice Online API running"));

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
    const user = await User.findById(req.user.userId).select("role username");
    if (!user) return res.status(401).json({ message: "User not found" });
    if (user.role !== "admin") return res.status(403).json({ message: "Admin only" });
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
      return res.status(400).json({ message: "Username, email, grade and password are required" });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const g = Number(grade);

    if (!Number.isFinite(g) || g < 8 || g > 12) {
      return res.status(400).json({ message: "Grade must be between 8 and 12" });
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
    if (!emailOk) return res.status(400).json({ message: "Invalid email address" });

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be 6+ characters" });
    }

    const usernameExists = await User.findOne({ username: cleanUsername });
    if (usernameExists) return res.status(409).json({ message: "Username already taken" });

    const emailExists = await User.findOne({ email: cleanEmail });
    if (emailExists) return res.status(409).json({ message: "Email already registered" });

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

    const cleanUsername = (username || "").trim();
    const user = await User.findOne({ username: cleanUsername });
    if (!user) return res.status(401).json({ message: "Invalid login" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid login" });

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET missing in env" });
    }

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
    const user = await User.findById(req.user.userId).select("username role email grade createdAt");
    if (!user) return res.status(401).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ QUIZ ROUTES ------------------ */

// ✅ List quizzes (fix: grade can be stored as number OR string)
app.get("/api/quizzes", authRequired, async (req, res) => {
  try {
    const gradeRaw = req.query.grade;
    let filter = {};

    // Supports: grade=12 and grade stored in Mongo as 12 OR "12"
    if (gradeRaw !== undefined && gradeRaw !== "") {
      const g = Number(gradeRaw);
      filter = Number.isFinite(g)
        ? { $or: [{ grade: g }, { grade: String(g) }] }
        : { grade: gradeRaw };
    }

    const quizzes = await Quiz.find(filter).sort({ createdAt: -1 });
    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Get single quiz
app.get("/api/quizzes/:id", authRequired, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    res.json(quiz);
  } catch {
    res.status(400).json({ message: "Invalid quiz id" });
  }
});

// ✅ Admin creates quiz
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
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error("Mongo error:", err.message));
