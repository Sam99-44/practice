import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema(
  {
    // ✅ NEW: question type
    type: {
      type: String,
      enum: ["mcq", "text"],
      default: "mcq",
      required: true,
    },

    text: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: "", trim: true },

    // ✅ NEW: hint shown to learners (especially for text answers)
    hint: { type: String, default: "", trim: true },

    // MCQ fields
    options: {
      type: [String],
      default: [],
      validate: {
        validator: function (arr) {
          // For mcq: at least 2 options
          if (this.type === "mcq") return Array.isArray(arr) && arr.length >= 2;
          // For text: options not required
          return true;
        },
        message: "A MCQ question must have at least 2 options",
      },
    },
    correctIndex: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: function (v) {
          // For mcq: required (>=0)
          if (this.type === "mcq") return Number.isFinite(v) && v >= 0;
          // For text: not used
          return true;
        },
        message: "MCQ correctIndex is required",
      },
    },

    // Text-answer fields
    correctText: {
      type: String,
      default: "",
      trim: true,
    },

    // ✅ NEW: how to mark text answers
    textAnswerMode: {
      type: String,
      enum: ["exact", "contains", "number_tolerance"],
      default: "exact",
    },
    // used when mode is number_tolerance
    numberTolerance: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const QuizSchema = new mongoose.Schema(
  {
    grade: { type: Number, required: true, min: 8, max: 12 },
    title: { type: String, required: true, trim: true },

    // ✅ Topic stays text input (already a string)
    topic: { type: String, default: "", trim: true },

    timeLimitMinutes: { type: Number, default: 10, min: 1, max: 180 },

    // optional instructions
    instructions: { type: String, default: "", trim: true },

    // availability / freeze
    isFrozen: { type: Boolean, default: false },
    frozenAt: { type: Date, default: null },
    availableFrom: { type: Date, default: null },
    availableUntil: { type: Date, default: null },

    questions: { type: [QuestionSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Quiz", QuizSchema);
