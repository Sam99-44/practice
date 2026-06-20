// models/Quiz.js

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
          if (this.type === "note") return v === 0;
          return Number.isInteger(v) && v >= 1;
        },
        message: "Points must be a whole number (1 or more) for questions, and 0 for notes.",
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
      default: -1,
      min: -1,
      validate: {
        validator: function (v) {
          if (this.type !== "mcq") return true;

          const usesMulti =
            Boolean(this.isMultiSelect) ||
            (Array.isArray(this.correctIndexes) && this.correctIndexes.length > 0);

          if (usesMulti) {
            return Number.isInteger(v) && v >= -1;
          }

          if (!Number.isInteger(v) || v < 0) return false;

          const len = Array.isArray(this.options) ? this.options.length : 0;
          return len >= 2 ? v < len : true;
        },
        message: "MCQ correctIndex must be valid within options.",
      },
    },

    correctIndexes: {
      type: [Number],
      default: [],
      validate: {
        validator: function (arr) {
          if (this.type !== "mcq") return true;
          if (!Array.isArray(arr)) return false;
          if (arr.length === 0) return true;
          if (!arr.every((n) => Number.isInteger(n) && n >= 0)) return false;

          const len = Array.isArray(this.options) ? this.options.length : 0;
          if (len >= 2 && arr.some((i) => i >= len)) return false;

          return new Set(arr).size === arr.length;
        },
        message: "correctIndexes must be valid unique option indexes.",
      },
    },

    isMultiSelect: {
      type: Boolean,
      default: false,
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
    },

    numberTolerance: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const QuizSchema = new mongoose.Schema(
  {
    grade: {
      type: Number,
      required: function () {
        return this.contentType !== "weeklyChallenge";
      },
      min: 8,
      max: 12,
      default: null,
    },

    title: { type: String, required: true, trim: true },
    topic: { type: String, default: "", trim: true },

    contentType: {
      type: String,
      enum: [
        "quiz",
        "activity",
        "homework",
        "assignment",
        "gradeChallenge",
        "weeklyChallenge",
      ],
      default: "quiz",
      index: true,
    },

    audience: {
      type: String,
      enum: ["grade", "all"],
      default: "grade",
      index: true,
    },

    isForAllLearners: {
      type: Boolean,
      default: false,
      index: true,
    },

    paper: {
      type: String,
      enum: ["paper1", "paper2"],
      default: "paper1",
      trim: true,
    },

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

    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    publishAt: { type: Date, default: null },

    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    sendPublishEmail: { type: Boolean, default: false },

    questions: { type: [QuestionSchema], default: [] },
  },
  { timestamps: true }
);

QuizSchema.pre("validate", function (next) {
  if (this.contentType === "weeklyChallenge") {
    this.grade = null;
    this.audience = "all";
    this.isForAllLearners = true;
  } else {
    this.audience = "grade";
    this.isForAllLearners = false;
  }

  next();
});

export default mongoose.model("Quiz", QuizSchema);
