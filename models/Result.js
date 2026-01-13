// models/Result.js
import mongoose from "mongoose";

const resultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true }, // ✅ for quick display

    quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },
    quizTitle: { type: String, default: "" },
    grade: { type: Number, default: null },
    topic: { type: String, default: "" },

    score: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 1 },
    percent: { type: Number, required: true, min: 0, max: 100 },

    // optional: store answers chosen by learner
    answers: { type: [Number], default: [] }
  },
  { timestamps: true }
);

// ✅ One attempt only (unique per user per quiz)
resultSchema.index({ userId: 1, quizId: 1 }, { unique: true });

export default mongoose.model("Result", resultSchema);
