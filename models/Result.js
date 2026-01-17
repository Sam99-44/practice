import mongoose from "mongoose";

const resultSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true
    },

    score: {
      type: Number,
      required: true,
      min: 0
    },

    total: {
      type: Number,
      required: true,
      min: 1
    },

    percent: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },

    // ✅ NEW FIELD
    status: {
      type: String,
      enum: ["PASS", "FAIL"],
      required: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("Result", resultSchema);
