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
      trim: true,
      default: ""
    },
    grade: {
      type: Number,
      min: 8,
      max: 12,
      required: true
    },
    topic: {
      type: String,
      trim: true,
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

    // 🧠 Learner answers (index = question index, value = chosen option)
    answers: {
      type: [Number],
      default: []
    }
  },
  {
    timestamps: true
  }
);

// 🚫 ONE attempt per user per quiz (hard rule)
resultSchema.index(
  { userId: 1, quizId: 1 },
  { unique: true }
);

// ⚡ Useful query index (admin + learner dashboards)
resultSchema.index({ createdAt: -1 });

export default mongoose.model("Result", resultSchema);
