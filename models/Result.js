import mongoose from "mongoose";

const ResultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    quizId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Quiz" },

    // ✅ These are needed for your Results table
    grade: { type: Number, required: true },
    topic: { type: String, default: "General", trim: true },
    title: { type: String, default: "Quiz", trim: true },

    score: { type: Number, required: true },
    total: { type: Number, required: true },
    percent: { type: Number, required: true },
    status: { type: String, required: true },
  },
  { timestamps: true }
);

// ✅ One attempt per quiz per user
ResultSchema.index({ userId: 1, quizId: 1 }, { unique: true });

export default mongoose.model("Result", ResultSchema);
