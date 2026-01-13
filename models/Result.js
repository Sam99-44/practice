// models/Result.js
import mongoose from "mongoose";

const answerSchema = new mongoose.Schema(
  {
    qIndex: { type: Number, required: true },
    chosenIndex: { type: Number, default: null },
    correctIndex: { type: Number, required: true },
    isCorrect: { type: Boolean, required: true }
  },
  { _id: false }
);

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

    // 📝 Quiz info
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
    score: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 1 },
    percent: { type: Number, required: true, min: 0, max: 100 },

    // 🧠 Learner answers (FULL DETAIL)
    answers: {
      type: [answerSchema],
      default: []
    }
  },
  { timestamps: true }
);

// 🚫 ONE attempt only
resultSchema.index({ userId: 1, quizId: 1 }, { unique: true });

// ⚡ Dashboard queries
resultSchema.index({ createdAt: -1 });

export default mongoose.model("Result", resultSchema);
