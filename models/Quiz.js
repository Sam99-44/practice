// models/Quiz.js (UPDATED - COPY & PASTE)
// ✅ Adds MCQ multi-select support
// ✅ Allows NOTE blocks to store points=0 and correctIndex=-1 (matches server.js)
// ✅ Validates correctIndex/correctIndexes are within options length
// ✅ Adds quiz difficulty (easy/moderate/hard)
// ✅ NEW: Adds quiz paper (paper1/paper2)

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

    // ✅ Solution / workings (supports LaTeX)
    solution: { type: String, default: "", trim: true },

    // ✅ Marks per question (only for mcq/text)
    points: {
      type: Number,
      default: 1,
      min: 0,
      validate: {
        validator: function (v) {
          if (this.type === "note") return v === 0; // notes must be 0
          return Number.isInteger(v) && v >= 1;
        },
        message: "Points must be a whole number (1 or more) for questions, and 0 for notes.",
      },
    },

    // ✅ MCQ options
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

    // ✅ Single-correct (compat)
    // IMPORTANT: allow -1 for note/text and for multi-select where correctIndexes is used
    correctIndex: {
      type: Number,
      default: -1,
      min: -1,
      validate: {
        validator: function (v) {
          if (this.type !== "mcq") return true; // ignore for text/note

          // If multi-select is used (either flag or correctIndexes provided), correctIndex can be -1
          const usesMulti =
            Boolean(this.isMultiSelect) ||
            (Array.isArray(this.correctIndexes) && this.correctIndexes.length > 0);

          if (usesMulti) {
            return Number.isInteger(v) && v >= -1;
          }

          // single-correct must be within options
          if (!Number.isInteger(v) || v < 0) return false;
          const len = Array.isArray(this.options) ? this.options.length : 0;
          return len >= 2 ? v < len : true;
        },
        message: "MCQ correctIndex must be valid (within options) for single-correct questions.",
      },
    },

    // ✅ Multi-correct indexes (preferred for multi-select)
    correctIndexes: {
      type: [Number],
      default: [],
      validate: {
        validator: function (arr) {
          if (this.type !== "mcq") return true;
          if (!Array.isArray(arr)) return false;

          // allow empty when using single correctIndex
          if (arr.length === 0) return true;

          // must be integers >= 0 and within options length
          if (!arr.every((n) => Number.isInteger(n) && n >= 0)) return false;

          const len = Array.isArray(this.options) ? this.options.length : 0;
          if (len >= 2 && arr.some((i) => i >= len)) return false;

          // no duplicates
          return new Set(arr).size === arr.length;
        },
        message: "correctIndexes must be valid unique option indexes within options length.",
      },
    },

    // ✅ flag to show checkboxes on learner UI
    isMultiSelect: {
      type: Boolean,
      default: false,
    },

    // ✅ TEXT questions
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

    // ✅ NEW: paper stored on quiz (Paper 1 / Paper 2)
    paper: {
      type: String,
      enum: ["paper1", "paper2"],
      default: "paper1",
      trim: true,
    },

    // ✅ difficulty stored on quiz (used for colour labels in learner-quizzes.html)
    difficulty: {
      type: String,
      enum: ["easy", "moderate", "hard"],
      default: "moderate",
      trim: true,
    },

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
