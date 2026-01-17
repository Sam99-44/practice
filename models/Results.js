import mongoose from "mongoose";

const ResultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },

    score: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 1 },
    percent: { type: Number, required: true, min: 0, max: 100 }
  },
  { timestamps: true }
);

// Useful index for fast queries
ResultSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Result", ResultSchema);
