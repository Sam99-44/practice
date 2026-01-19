import mongoose from "mongoose";

const AnswerSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true, min: 0 },

    // ✅ for MCQ
    chosenIndex: { type: Number, default: -1, min: -1 },

    // ✅ for Text
    chosenText: { type: String, default: "", trim: true },

    // snapshot for review
    type: { type: String, enum: ["mcq", "text"], default: "mcq" },
    correctIndex: { type: Number, default: -1, min: -1 },
    correctText: { type: String, default: "", trim: true },
    isCorrect: { type: Boolean, required: true },

    questionText: { type: String, default: "" },
    options: { type: [String], default: [] },
    hint: { type: String, default: "" },
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
