// Server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import Quiz from "./models/Quiz.js";
import User from "./models/User.js";
import Result from "./models/Result.js";

dotenv.config();

const app = express();
app.use(express.json());

/* ------------------ CORS ------------------ */
const ALLOWED_ORIGINS = [
  process.env.APP_URL, // e.g. https://practiceonline.netlify.app
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // allow requests like curl/postman (no origin)
      if (!origin) return cb(null, true);

      // allow explicit list
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);

      // ✅ allow Netlify sites (including deploy previews)
      if (origin.endsWith(".netlify.app")) return cb(null, true);

      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: true,
  })
);

// ✅ handle preflight
app.options("*", cors());

// ✅ clearer CORS error responses
app.use((err, req, res, next) => {
  if (err?.message?.startsWith("CORS blocked")) {
    return res.status(403).json({ message: err.message });
  }
  next(err);
});

/* ------------------ HEALTH ------------------ */
app.get("/", (req, res) => res.send("Practice Online API running"));
app.get("/api/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

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
    res.status(401).json({ message: "Invalid token" });
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

/* ------------------ AUTH ROUTES ------------------ */

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, grade, password } = req.body;

    if (!username || !email || !grade || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const g = Number(grade);
    if (!Number.isFinite(g) || g < 8 || g > 12) {
      return res.status(400).json({ message: "Grade must be 8–12" });
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) return res.status(400).json({ message: "Invalid email" });

    if (password.length < 6) {
      return res.status(400).json({ message: "Password too short" });
    }

    if (await User.findOne({ username })) {
      return res.status(409).json({ message: "Username taken" });
    }

    if (await User.findOne({ email })) {
      return res.status(409).json({ message: "Email exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await User.create({
      username,
      email,
      grade: g,
      passwordHash,
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

    const user = await User.findOne({ username });
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

// ✅ Me (used by nav + admin checks)
app.get("/api/auth/me", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("username role grade email");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      username: user.username,
      role: user.role || "learner",
      grade: user.grade,
      email: user.email,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ QUIZ ROUTES ------------------ */

// List quizzes (optional grade filter)
app.get("/api/quizzes", authRequired, async (req, res) => {
  try {
    const grade = req.query.grade;
    const filter = grade ? { grade: Number(grade) } : {};
    const quizzes = await Quiz.find(filter).sort({ createdAt: -1 });
    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Get quiz by id (needed by attempt.html)
app.get("/api/quizzes/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid quiz id" });
    }

    const quiz = await Quiz.findById(id);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    res.json(quiz);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create quiz (admin only)
app.post("/api/quizzes", authRequired, adminOnly, async (req, res) => {
  try {
    const quiz = await Quiz.create(req.body);
    res.status(201).json(quiz);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* ------------------ RESULTS ROUTES ------------------ */

// Save result (ONE attempt per quiz)
app.post("/api/results", authRequired, async (req, res) => {
  try {
    const { quizId, score, total } = req.body;

    if (!quizId || score === undefined || total === undefined) {
      return res.status(400).json({ message: "quizId, score, total required" });
    }

    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ message: "Invalid quizId" });
    }

    const quiz = await Quiz.findById(quizId).select("grade topic title");
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    const s = Number(score);
    const t = Number(total);
    if (!Number.isFinite(s) || !Number.isFinite(t) || t <= 0) {
      return res.status(400).json({ message: "Invalid score/total" });
    }

    const percent = Math.round((s / t) * 100);
    const status = percent >= 50 ? "PASS" : "FAIL";

    const exists = await Result.findOne({
      userId: req.user.userId,
      quizId,
    });

    if (exists) {
      return res.status(409).json({ message: "Quiz already attempted" });
    }

    const saved = await Result.create({
      userId: req.user.userId,
      quizId,
      grade: Number(quiz.grade),
      topic: quiz.topic || "General",
      title: quiz.title || "Quiz",
      score: s,
      total: t,
      percent,
      status,
    });

    res.status(201).json({
      message: "Result saved",
      percent,
      status,
      resultId: saved._id,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Quiz already attempted" });
    }
    res.status(500).json({ message: err.message });
  }
});

// Get my results
app.get("/api/results/my", authRequired, async (req, res) => {
  try {
    const results = await Result.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(200);

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
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
