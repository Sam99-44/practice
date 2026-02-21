// models/Result.js (UPDATED FOR MULTI-SELECT MCQ - COPY & PASTE)
// ✅ Supports MCQ single-select (chosenIndex/correctIndex) AND multi-select (chosenIndexes/correctIndexes)
// ✅ Keeps notes + points/earnedPoints + solution snapshot
// ✅ Learners: enforce ONE attempt per quiz (DB-level) via partial unique index
// ✅ Admin: can attempt SAME quiz many times (DB allows multiple)

import mongoose from "mongoose";

const AnswerSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true, min: 0 },

    type: { type: String, enum: ["mcq", "text", "note"], default: "mcq" },

    // ✅ points snapshot
    points: { type: Number, default: 0, min: 0 },
    earnedPoints: { type: Number, default: 0, min: 0 },

    // ---------------- MCQ (single-select legacy) ----------------
    chosenIndex: { type: Number, default: -1, min: -1 },
    correctIndex: { type: Number, default: -1, min: -1 },

    // ---------------- MCQ (multi-select new) ----------------
    // learner picks multiple answers (checkbox style)
    chosenIndexes: {
      type: [Number],
      default: undefined, // only store when multi-select is used
      set: (arr) => {
        if (!Array.isArray(arr)) return arr;
        const uniq = [...new Set(arr.map((x) => Number(x)).filter(Number.isInteger))];
        uniq.sort((a, b) => a - b);
        return uniq;
      },
    },

    // correct multiple answers (snapshot from Quiz)
    correctIndexes: {
      type: [Number],
      default: undefined, // only store when multi-select is used
      set: (arr) => {
        if (!Array.isArray(arr)) return arr;
        const uniq = [...new Set(arr.map((x) => Number(x)).filter(Number.isInteger))];
        uniq.sort((a, b) => a - b);
        return uniq;
      },
    },

    // TEXT
    textAnswer: { type: String, default: "" },
    correctText: { type: String, default: "" },

    hint: { type: String, default: "" },

    // ✅ solution/workings snapshot
    solution: { type: String, default: "" },

    answerMode: {
      type: String,
      enum: ["case-insensitive", "exact", "number", "multi-select"],
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

    score: { type: Number, required: true },
    total: { type: Number, required: true },
    percent: { type: Number, required: true },
    status: { type: String, enum: ["PASS", "FAIL"], required: true },

    answers: { type: [AnswerSchema], default: [] },
    timeTakenSeconds: { type: Number, default: 0, min: 0 },

    isAdminAttempt: { type: Boolean, default: false },
    attemptNo: { type: Number, default: 1, min: 1 },
    attemptedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ✅ Learners: only ONE attempt per quiz (admins can have many)
ResultSchema.index(
  { userId: 1, quizId: 1 },
  { unique: true, partialFilterExpression: { isAdminAttempt: false } }
);

export default mongoose.model("Result", ResultSchema);
