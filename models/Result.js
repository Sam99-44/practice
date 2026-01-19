import mongoose from "mongoose";

const AnswerSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true, min: 0 },

    // ✅ NEW: question type
    type: { type: String, enum: ["mcq", "text"], default: "mcq" },

    // MCQ
    chosenIndex: { type: Number, default: -1, min: -1 },
    correctIndex: { type: Number, default: -1, min: -1 },

    // TEXT
    textAnswer: { type: String, default: "" },     // what learner typed
    correctText: { type: String, default: "" },    // ✅ correct answer text
    hint: { type: String, default: "" },

    // optional grading info (useful for numeric answers)
    answerMode: {
      type: String,
      enum: ["case-insensitive", "exact", "number"],
      default: "case-insensitive",
    },
    roundTo: { type: Number, default: null },
    tolerance: { type: Number, default: null },

    isCorrect: { type: Boolean, required: true },

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

    score: { type: Number, required: true },
    total: { type: Number, required: true },
    percent: { type: Number, required: true },
    status: { type: String, enum: ["PASS", "FAIL"], required: true },

    answers: { type: [AnswerSchema], default: [] },
    timeTakenSeconds: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

ResultSchema.index({ userId: 1, quizId: 1 }, { unique: true });

export default mongoose.model("Result", ResultSchema);
