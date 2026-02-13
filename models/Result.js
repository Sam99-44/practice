// models/Result.js (UPDATED - COPY & PASTE)
// ✅ Adds type: "note"
// ✅ Stores points + earnedPoints per saved answer

import mongoose from "mongoose";

const AnswerSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true, min: 0 },

    type: { type: String, enum: ["mcq", "text", "note"], default: "mcq" },

    // ✅ points snapshot (so review can display marks per question)
    points: { type: Number, default: 0, min: 0 },
    earnedPoints: { type: Number, default: 0, min: 0 },

    // MCQ
    chosenIndex: { type: Number, default: -1, min: -1 },
    correctIndex: { type: Number, default: -1, min: -1 },

    // TEXT
    textAnswer: { type: String, default: "" },
    correctText: { type: String, default: "" },
    hint: { type: String, default: "" },

    answerMode: {
      type: String,
      enum: ["case-insensitive", "exact", "number"],
      default: "case-insensitive",
    },
    roundTo: { type: Number, default: null },
    tolerance: { type: Number, default: null },

    isCorrect: { type: Boolean, default: false },

    // Snapshot question content
    questionText: { type: String, default: "" },
    options: { type: [String], default: [] },
  },
  { _id: false }
);

const ResultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },

    grade: { type: Number, required: true },

    topic: { type: String, default: "General" },
    title: { type: String, default: "Assessment" },

    instructions: { type: String, default: "" },

    score: { type: Number, required: true }, // ✅ now points-based
    total: { type: Number, required: true }, // ✅ now points-based
    percent: { type: Number, required: true },
    status: { type: String, enum: ["PASS", "FAIL"], required: true },

    answers: { type: [AnswerSchema], default: [] },
    timeTakenSeconds: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

ResultSchema.index({ userId: 1, quizId: 1 }, { unique: true });

export default mongoose.model("Result", ResultSchema);
