// Server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import User from "./models/User.js";
import Quiz from "./models/Quiz.js";
import payfastRoutes from "./routes/payfast.js"; // ✅ CORRECT

dotenv.config();

const app = express();

/* ------------------ MIDDLEWARE ------------------ */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(
  cors({
    origin: "*"
  })
);

/* ------------------ ROUTES ------------------ */
app.use("/api/payfast", payfastRoutes);

/* ------------------ AUTH HELPERS ------------------ */
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

async function premiumRequired(req, res, next) {
  const user = await User.findById(req.user.userId);

  if (!user) return res.status(401).json({ message: "User not found" });
  if (user.role === "admin") return next();

  const now = new Date();

  if (user.premium && user.premiumExpiresAt <= now) {
    user.premium = false;
    user.premiumExpiresAt = null;
    await user.save();
  }

  if (!user.premium) {
    return res.status(403).json({ message: "Premium required" });
  }

  next();
}

/* ------------------ AUTH ------------------ */
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
    "username email role premium premiumExpiresAt"
  );
  res.json(user);
});

/* ------------------ QUIZZES ------------------ */
app.get("/api/quizzes", authRequired, premiumRequired, async (req, res) => {
  const quizzes = await Quiz.find().sort({ createdAt: -1 });
  res.json(quizzes);
});

/* ------------------ START ------------------ */
const PORT = process.env.PORT || 10000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, "0.0.0.0", () =>
      console.log(`Server running on port ${PORT}`)
    );
  })
  .catch(err => console.error(err));
