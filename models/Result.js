// models/Result.js
import mongoose from "mongoose";

const resultSchema = new mongoose.Schema(
  {
    // 🔐 Who attempted
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    username: {
      type: String,
      required: true,
      trim: true
    },

    // 📝 What quiz
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true
    },
    quizTitle: {
      type: String,
      default: ""
    },
    grade: {
      type: Number,
      min: 8,
      max: 12,
      default: null
    },
    topic: {
      type: String,
      default: ""
    },

    // 📊 Result
    score: {
      type: Number,
      required: true,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 1
    },
    percent: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },

    // 🧠 Learner answers (optional but useful)
    answers: {
      type: [Number],
      default: []
    }
  },
  {
    timestamps: true
  }
);

// 🚫 Enforce ONE attempt per user per quiz
resultSchema.index(
  { userId: 1, quizId: 1 },
  { unique: true }
);

export default mongoose.model("Result", resultSchema);
