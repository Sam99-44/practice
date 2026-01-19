import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema(
  {
    // ✅ NEW: question type
    type: { type: String, enum: ["mcq", "text"], default: "mcq" },

    text: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: "", trim: true },

    // ✅ NEW: hint (shown to learner)
    hint: { type: String, default: "", trim: true },

    // MCQ fields (A–D)
    options: {
      type: [String],
      default: undefined,
    },
    correctIndex: { type: Number, default: 0, min: 0 },

    // ✅ Typed-answer fields
    correctText: { type: String, default: "", trim: true }, // e.g. "3.14" or "photosynthesis"

    // How to compare typed answers
    answerMode: {
      type: String,
      enum: ["exact", "case-insensitive", "number"],
      default: "case-insensitive",
    },

    // For numbers: rounding and tolerance
    roundTo: { type: Number, default: null, min: 0, max: 10 }, // e.g. 2 decimals
    tolerance: { type: Number, default: null, min: 0 }, // e.g. 0.01
  },
  { _id: false }
);

const QuizSchema = new mongoose.Schema(
  {
    grade: { type: Number, required: true, min: 8, max: 12 },
    title: { type: String, required: true, trim: true },
    topic: { type: String, default: "", trim: true },

    timeLimitMinutes: { type: Number, default: 10, min: 1, max: 180 },

    questions: { type: [QuestionSchema], default: [] },

    // Freeze support (you already use these)
    isFrozen: { type: Boolean, default: false },
    frozenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Quiz", QuizSchema);
