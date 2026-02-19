// models/Quiz.js (UPDATED - COPY & PASTE)
// ✅ Adds type: "note"
// ✅ Adds points (marks) per question for mcq/text
// ✅ Adds solution/workings per question (solution)
// ✅ Notes have no points (treated as 0)

import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["mcq", "text", "note"],
      default: "mcq",
      required: true,
    },

    text: { type: String, required: true, trim: true },

    imageUrl: { type: String, default: "", trim: true },
    hint: { type: String, default: "", trim: true },

    // ✅ NEW: Solution / workings (supports LaTeX)
    solution: { type: String, default: "", trim: true },

    // ✅ Marks per question (only for mcq/text)
    points: {
      type: Number,
      default: 1,
      min: 0,
      validate: {
        validator: function (v) {
          if (this.type === "note") return true; // notes ignore points
          return Number.isInteger(v) && v >= 1;
        },
        message: "Points must be a whole number (1 or more) for questions.",
      },
    },

    options: {
      type: [String],
      default: [],
      validate: {
        validator: function (arr) {
          if (this.type === "mcq") return Array.isArray(arr) && arr.length >= 2;
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
          if (this.type === "mcq") return Number.isFinite(v) && v >= 0;
          return true;
        },
        message: "MCQ correctIndex is required",
      },
    },

    correctText: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (this.type === "text") return String(v || "").trim().length > 0;
          return true;
        },
        message: "Typed questions must have correctText",
      },
    },

    textAnswerMode: {
      type: String,
      enum: ["exact", "contains", "number_tolerance"],
      default: "exact",
      validate: {
        validator: function (v) {
          if (this.type !== "text") return true;
          return ["exact", "contains", "number_tolerance"].includes(v);
        },
        message: "Invalid textAnswerMode",
      },
    },

    numberTolerance: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: function (v) {
          if (this.type !== "text") return true;
          if (this.textAnswerMode !== "number_tolerance") return true;
          return Number.isFinite(v) && v >= 0;
        },
        message: "numberTolerance must be 0 or more for number_tolerance mode",
      },
    },
  },
  { _id: false }
);

const QuizSchema = new mongoose.Schema(
  {
    grade: { type: Number, required: true, min: 8, max: 12 },

    title: { type: String, required: true, trim: true },
    topic: { type: String, default: "", trim: true },

    timeLimitMinutes: { type: Number, default: 10, min: 1, max: 180 },

    instructions: { type: String, default: "", trim: true },

    isFrozen: { type: Boolean, default: false },
    frozenAt: { type: Date, default: null },
    availableFrom: { type: Date, default: null },
    availableUntil: { type: Date, default: null },

    questions: { type: [QuestionSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Quiz", QuizSchema);
