import mongoose from "mongoose";

const AnswerSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true, min: 0 },
    chosenIndex: { type: Number, required: true, min: 0 },
    correctIndex: { type: Number, required: true, min: 0 },
    isCorrect: { type: Boolean, required: true },

    // Snapshot (so review still works even if quiz changes later)
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
    title: { type: String, default: "Quiz" },

    score: { type: Number, required: true },
    total: { type: Number, required: true },
    percent: { type: Number, required: true },
    status: { type: String, enum: ["PASS", "FAIL"], required: true },

    // ✅ NEW
    answers: { type: [AnswerSchema], default: [] },
    timeTakenSeconds: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// ✅ One attempt per quiz per user
ResultSchema.index({ userId: 1, quizId: 1 }, { unique: true });

export default mongoose.model("Result", ResultSchema);
