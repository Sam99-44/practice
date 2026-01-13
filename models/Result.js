// models/Result.js
import mongoose from "mongoose";

const resultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },

    score: { type: Number, required: true },
    total: { type: Number, required: true },
    percent: { type: Number, required: true },

    // optional: store answers chosen by the learner (useful for review)
    answers: { type: [Number], default: [] }
  },
  { timestamps: true }
);

// ✅ One attempt only (unique per user per quiz)
resultSchema.index({ userId: 1, quizId: 1 }, { unique: true });

export default mongoose.model("Result", resultSchema);
