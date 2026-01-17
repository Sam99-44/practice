// models/Result.js
import mongoose from "mongoose";

const ResultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true, index: true },

    // Snapshot fields (helpful if quiz changes later)
    grade: { type: Number, min: 8, max: 12, default: null },
    topic: { type: String, default: "" },
    title: { type: String, default: "" },

    score: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 1 },
    percent: { type: Number, required: true, min: 0, max: 100 }
  },
  { timestamps: true }
);

export default mongoose.model("Result", ResultSchema);
