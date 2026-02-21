// models/Quiz.js (UPDATED FOR MULTI-SELECT MCQ - COPY & PASTE)
// ✅ Adds correctIndexes: [Number] for multi-select MCQ
// ✅ Backwards compatible with correctIndex (single)
// ✅ Validation rules:
//    - MCQ must have >= 2 options
//    - If correctIndexes is provided (length>0): it must be valid indexes within options
//    - Else uses correctIndex (single) and validates it's within options
// ✅ Notes ignore points

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

    solution: { type: String, default: "", trim: true },

    points: {
      type: Number,
      default: 1,
      min: 0,
      validate: {
        validator: function (v) {
          if (this.type === "note") return true;
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

    // ✅ Single-correct (legacy)
    correctIndex: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: function (v) {
          if (this.type !== "mcq") return true;

          // If multi-correct is being used, skip single validation
          if (Array.isArray(this.correctIndexes) && this.correctIndexes.length > 0) return true;

          // single must be within options
          const len = Array.isArray(this.options) ? this.options.length : 0;
          if (len < 2) return true; // options validator will handle
          return Number.isInteger(v) && v >= 0 && v < len;
        },
        message: "MCQ correctIndex must be within options.",
      },
    },

    // ✅ Multi-select correct answers
    correctIndexes: {
      type: [Number],
      default: undefined, // keep empty unless you set it
      validate: {
        validator: function (arr) {
          if (this.type !== "mcq") return true;
          if (arr === undefined) return true; // not using multi-select

          // if provided, must have at least 1 correct
          if (!Array.isArray(arr) || arr.length < 1) return false;

          const len = Array.isArray(this.options) ? this.options.length : 0;
          if (len < 2) return true;

          // all must be integers and within options
          const uniq = [...new Set(arr.map((x) => Number(x)))];
          if (uniq.some((x) => !Number.isInteger(x))) return false;
          if (uniq.some((x) => x < 0 || x >= len)) return false;

          return true;
        },
        message: "MCQ correctIndexes must contain valid option indexes (at least 1).",
      },
      set: function (arr) {
        // normalize: unique + sorted
        if (!Array.isArray(arr)) return arr;
        const uniq = [...new Set(arr.map((x) => Number(x)).filter(Number.isInteger))];
        uniq.sort((a, b) => a - b);
        return uniq;
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
