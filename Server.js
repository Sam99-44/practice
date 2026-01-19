// server.js
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
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      if (origin.endsWith(".netlify.app")) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: true,
  })
);

app.options("*", cors());

// clearer CORS error
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

/* ------------------ HELPERS ------------------ */
function isQuizAvailableForLearner(quiz) {
  const now = new Date();

  if (quiz.isFrozen) return { ok: false, reason: "unavailable" };

  if (quiz.availableFrom && now < new Date(quiz.availableFrom)) {
    return { ok: false, reason: "unavailable" };
  }

  if (quiz.availableUntil && now > new Date(quiz.availableUntil)) {
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true };
}

function clean(s) {
  return String(s ?? "").trim();
}
function norm(s) {
  return clean(s).replace(/\s+/g, " ");
}

/* ✅ Typed-answer correctness (supports: exact / contains / number_tolerance) */
function isCorrectTextAnswer(q, typedRaw) {
  const typed = norm(typedRaw);
  const correct = norm(q?.correctText);

  if (!typed || !correct) return false;

  const mode = q?.textAnswerMode || "exact";

  if (mode === "contains") {
    return typed.toLowerCase().includes(correct.toLowerCase());
  }

  if (mode === "number_tolerance") {
    const a = Number(typed);
    const b = Number(correct);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;

    const tol =
      Number.isFinite(Number(q?.numberTolerance)) && q.numberTolerance !== null
        ? Number(q.numberTolerance)
        : 0;

    return Math.abs(a - b) <= tol;
  }

  // exact (case-insensitive)
  return typed.toLowerCase() === correct.toLowerCase();
}

/* ------------------ AUTH ROUTES ------------------ */
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

/* ------------------ ADMIN ROUTES ------------------ */

// ✅ Admin stats (correct counts)
app.get("/api/admin/stats", authRequired, adminOnly, async (req, res) => {
  try {
    const [totalUsers, totalAssessments, quizzesByGrade] = await Promise.all([
      User.countDocuments({}),
      Quiz.countDocuments({}),
      Quiz.aggregate([
        { $group: { _id: "$grade", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, grade: "$_id", count: 1 } },
      ]),
    ]);

    res.json({
      totalUsers,
      totalQuizzes: totalAssessments, // compatibility
      totalAssessments,
      quizzesByGrade,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ✅ Admin attempts audit (filters)
app.get("/api/admin/attempts", authRequired, adminOnly, async (req, res) => {
  try {
    const { grade, topic, title, username, from, to, limit = "200" } = req.query;

    const q = {};

    if (grade) q.grade = Number(grade);
    if (topic) q.topic = { $regex: String(topic), $options: "i" };
    if (title) q.title = { $regex: String(title), $options: "i" };

    if (from || to) {
      q.createdAt = {};
      if (from) q.createdAt.$gte = new Date(String(from));
      if (to) q.createdAt.$lte = new Date(String(to));
    }

    // username filter
    if (username) {
      const users = await User.find({
        username: { $regex: String(username), $options: "i" },
      }).select("_id");

      const userIds = users.map((u) => u._id);
      q.userId = { $in: userIds.length ? userIds : [new mongoose.Types.ObjectId()] };
    }

    const lim = Math.max(1, Math.min(Number(limit) || 200, 1000));

    const results = await Result.find(q)
      .sort({ createdAt: -1 })
      .limit(lim)
      .populate("userId", "username grade")
      .select("userId quizId grade topic title score total percent status timeTakenSeconds createdAt");

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ QUIZ ROUTES ------------------ */

// List quizzes
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

// Get quiz by id
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

// Create quiz
app.post("/api/quizzes", authRequired, adminOnly, async (req, res) => {
  try {
    const quiz = await Quiz.create(req.body);
    res.status(201).json(quiz);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update quiz (admin only)
app.put("/api/quizzes/:id", authRequired, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid quiz id" });
    }

    const allowed = (({
      grade,
      title,
      topic,
      questions,
      timeLimitMinutes,
      instructions,
      isFrozen,
      frozenAt,
      availableFrom,
      availableUntil,
    }) => ({
      grade,
      title,
      topic,
      questions,
      timeLimitMinutes,
      instructions,
      isFrozen,
      frozenAt,
      availableFrom,
      availableUntil,
    }))(req.body);

    const updated = await Quiz.findByIdAndUpdate(id, allowed, {
      new: true,
      runValidators: true,
    });

    if (!updated) return res.status(404).json({ message: "Quiz not found" });

    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete quiz (admin only)
app.delete("/api/quizzes/:id", authRequired, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid quiz id" });
    }

    const deleted = await Quiz.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Quiz not found" });

    res.json({ message: "Quiz deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ RESULTS ROUTES ------------------ */

// ✅ Save result + snapshot answers (MCQ + typed) + BLOCK if unavailable
app.post("/api/results", authRequired, async (req, res) => {
  try {
    const { quizId, answers, timeTakenSeconds } = req.body;

    if (!quizId) return res.status(400).json({ message: "quizId required" });
    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ message: "Invalid quizId" });
    }

    const quiz = await Quiz.findById(quizId).select(
      "grade topic title questions isFrozen frozenAt availableFrom availableUntil"
    );
    if (!quiz) return res.status(404).json({ message: "Assessment not found" });

    // ✅ block attempt if unavailable
    const availability = isQuizAvailableForLearner(quiz);
    if (!availability.ok) {
      return res.status(403).json({
        message: "This assessment is currently unavailable. Please check back later.",
      });
    }

    // one attempt
    const exists = await Result.findOne({ userId: req.user.userId, quizId });
    if (exists) return res.status(409).json({ message: "Assessment already attempted" });

    const quizQuestions = Array.isArray(quiz.questions) ? quiz.questions : [];
    const incoming = Array.isArray(answers) ? answers : [];

    let score = 0;
    const total = quizQuestions.length;

    const snapshotAnswers = incoming
      .filter((a) => a && Number.isFinite(Number(a.questionIndex)))
      .map((a) => {
        const qi = Number(a.questionIndex);
        const q = quizQuestions[qi];

        const type = q?.type || "mcq";

        // MCQ
        const chosenIndex = Number.isFinite(Number(a.chosenIndex))
          ? Number(a.chosenIndex)
          : -1;

        // TEXT
        const chosenText = clean(a.chosenText);

        let isCorrect = false;

        // correct snapshot fields
        const correctIndex =
          type === "mcq" && Number.isFinite(Number(q?.correctIndex))
            ? Number(q.correctIndex)
            : -1;

        const correctText = type === "text" ? clean(q?.correctText) : "";

        if (type === "text") {
          isCorrect = isCorrectTextAnswer(q || {}, chosenText);
        } else {
          isCorrect =
            chosenIndex !== -1 &&
            correctIndex !== -1 &&
            Number(chosenIndex) === Number(correctIndex);
        }

        if (isCorrect) score++;

        return {
          questionIndex: qi,
          type,

          // chosen
          chosenIndex,
          chosenText,

          // correct
          correctIndex,
          correctText,

          isCorrect,

          // snapshots
          questionText: q?.text || "",
          options: Array.isArray(q?.options) ? q.options : [],
          hint: q?.hint || "",
        };
      });

    const percent = total > 0 ? Math.round((score / total) * 100) : 0;
    const status = percent >= 50 ? "PASS" : "FAIL";

    const tSec = Number(timeTakenSeconds);
    const safeTimeTakenSeconds = Number.isFinite(tSec) && tSec >= 0 ? tSec : 0;

    const saved = await Result.create({
      userId: req.user.userId,
      quizId,
      grade: Number(quiz.grade),
      topic: quiz.topic || "General",
      title: quiz.title || "Assessment",
      score,
      total,
      percent,
      status,
      answers: snapshotAnswers,
      timeTakenSeconds: safeTimeTakenSeconds,
    });

    res.status(201).json({
      message: "Result saved",
      percent,
      status,
      resultId: saved._id,
      score,
      total,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Assessment already attempted" });
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

// Get one result with answers (review)
app.get("/api/results/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid result id" });
    }

    const result = await Result.findById(id);
    if (!result) return res.status(404).json({ message: "Result not found" });

    if (String(result.userId) !== String(req.user.userId)) {
      const me = await User.findById(req.user.userId).select("role");
      if (!me || me.role !== "admin") {
        return res.status(403).json({ message: "Not allowed" });
      }
    }

    res.json(result);
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
