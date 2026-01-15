// Server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import Quiz from "./models/Quiz.js";
import User from "./models/User.js";
import payfastRoutes from "./routes/payfast.js"; // ✅ CORRECT PATH

import { verifySmtp } from "./utils/mailer.js";

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
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // ✅ PayFast ITN

/* ------------------ ROUTES ------------------ */
app.use("/api/payfast", payfastRoutes); // ✅ MUST BE HERE

/* ------------------ HEALTH ------------------ */
app.get("/", (req, res) => {
  res.send("Practice Online API running");
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/* ------------------ AUTH MIDDLEWARE ------------------ */
function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

async function adminOnly(req, res, next) {
  const user = await User.findById(req.user.userId).select("role");
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
}

async function premiumRequired(req, res, next) {
  const user = await User.findById(req.user.userId);
  if (!user) return res.status(401).json({ message: "User not found" });

  if (user.role === "admin") return next();

  const now = new Date();

  if (user.premium && user.premiumExpiresAt <= now) {
    user.premium = false;
    user.premiumActivatedAt = null;
    user.premiumExpiresAt = null;
    await user.save();
  }

  if (!user.premium) {
    return res.status(403).json({
      message: "Premium required. Please pay R95."
    });
  }

  next();
}

/* ------------------ AUTH ROUTES ------------------ */
app.post("/api/auth/register", async (req, res) => {
  const { username, email, password, grade } = req.body;

  if (!username || !email || !password || !grade) {
    return res.status(400).json({ message: "All fields required" });
  }

  if (await User.findOne({ email: email.toLowerCase() })) {
    return res.status(409).json({ message: "Email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await User.create({
    username,
    email: email.toLowerCase(),
    passwordHash,
    grade
  });

  res.status(201).json({ message: "Account created" });
});

app.post("/api/auth/login", async (req, res) => {
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
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  const user = await User.findById(req.user.userId).select(
    "username email role grade premium premiumExpiresAt createdAt"
  );
  res.json(user);
});

/* ------------------ QUIZ ROUTES ------------------ */
app.get("/api/quizzes", authRequired, premiumRequired, async (req, res) => {
  const grade = Number(req.query.grade);
  const filter = grade ? { grade } : {};
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

/* ------------------ START SERVER ------------------ */
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");

    try {
      await verifySmtp();
      console.log("SMTP verified ✅");
    } catch {
      console.log("SMTP not available");
    }

    app.listen(PORT, "0.0.0.0", () =>
      console.log(`Server running on port ${PORT}`)
    );
  })
  .catch(err => console.error("Mongo error:", err.message));
