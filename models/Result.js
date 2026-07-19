// models/Result.js (UPDATED - COPY & PASTE)
// ✅ Stores multi-select answers properly for review/results:
//    - chosenIndexes: [Number] (what learner ticked)
//    - correctIndexes: [Number] (the right ticks)
// ✅ Still keeps chosenIndex/correctIndex for backwards compatibility
// ✅ Stores dropdown answers:
//    - dropdownAnswer
//    - correctDropdownAnswer
// ✅ Stores fill-in answers:
//    - fillAnswers
//    - correctFillAnswers
// ✅ Stores universal typed answers:
//    - typedValues: learner values
//    - correctTypedValues: correct values
//    - answerFields: display + marking snapshot
//    - instruction / prefix / suffix / unit
// ✅ Supports exact, contains, number_tolerance, unordered and expression modes
// ✅ Learners: 1 attempt per quiz (unique index)
// ✅ Admin: unlimited retries (partial unique index excludes admin attempts).

import mongoose from "mongoose";

const TypedValueSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },

    value: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const AnswerFieldSnapshotSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },

    prefix: {
      type: String,
      default: "",
      trim: true,
    },

    suffix: {
      type: String,
      default: "",
      trim: true,
    },

    value: {
      type: String,
      default: "",
      trim: true,
    },

    correctAnswer: {
      type: String,
      default: "",
      trim: true,
    },

    isCorrect: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const AnswerSchema = new mongoose.Schema(
  {
    questionIndex: {
      type: Number,
      required: true,
      min: 0,
    },

    type: {
      type: String,
      enum: ["mcq", "text", "dropdown", "fill", "note"],
      default: "mcq",
    },

    // Points snapshot
    points: {
      type: Number,
      default: 0,
      min: 0,
    },

    earnedPoints: {
      type: Number,
      default: 0,
      min: 0,
    },

    // MCQ: single answer compatibility
    chosenIndex: {
      type: Number,
      default: -1,
      min: -1,
    },

    correctIndex: {
      type: Number,
      default: -1,
      min: -1,
    },

    // MCQ: multi-select
    isMultiSelect: {
      type: Boolean,
      default: false,
    },

    chosenIndexes: {
      type: [Number],
      default: [],
    },

    correctIndexes: {
      type: [Number],
      default: [],
    },

    // Dropdown answer snapshot
    dropdownAnswer: {
      type: String,
      default: "",
      trim: true,
    },

    correctDropdownAnswer: {
      type: String,
      default: "",
      trim: true,
    },

    // Fill-in answer snapshot
    fillAnswers: {
      type: [String],
      default: [],
    },

    correctFillAnswers: {
      type: [String],
      default: [],
    },

    // Typed answer: old compatibility fields
    textAnswer: {
      type: String,
      default: "",
    },

    correctText: {
      type: String,
      default: "",
    },

    /*
     * Universal typed-answer values.
     *
     * Example:
     * typedValues: [
     *   { key: "x", value: "2" },
     *   { key: "y", value: "3" }
     * ]
     */
    typedValues: {
      type: [TypedValueSchema],
      default: [],
    },

    correctTypedValues: {
      type: [TypedValueSchema],
      default: [],
    },

    /*
     * Full field snapshot for review.
     *
     * This preserves exactly what the learner saw:
     * - field label/prefix
     * - suffix/unit
     * - learner value
     * - correct value
     * - field correctness
     */
    answerFields: {
      type: [AnswerFieldSnapshotSchema],
      default: [],
    },

    // Typed-answer display snapshot
    instruction: {
      type: String,
      default: "",
      trim: true,
    },

    answerPrefix: {
      type: String,
      default: "",
      trim: true,
    },

    answerSuffix: {
      type: String,
      default: "",
      trim: true,
    },

    unit: {
      type: String,
      default: "",
      trim: true,
    },

    hint: {
      type: String,
      default: "",
    },

    // Solution/workings snapshot
    solution: {
      type: String,
      default: "",
    },

    /*
     * Keep old stored values and accept the new Quiz modes.
     */
    answerMode: {
      type: String,
      enum: [
        "case-insensitive",
        "exact",
        "number",
        "contains",
        "number_tolerance",
        "unordered",
        "expression",
      ],
      default: "case-insensitive",
    },

    roundTo: {
      type: Number,
      default: null,
    },

    tolerance: {
      type: Number,
      default: null,
      min: 0,
    },

    isCorrect: {
      type: Boolean,
      default: false,
    },

    // Snapshot question content
    questionText: {
      type: String,
      default: "",
    },

    options: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const ResultSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
    },

    // Safer for migrations and old data
    grade: {
      type: Number,
      default: null,
    },

    topic: {
      type: String,
      default: "General",
    },

    title: {
      type: String,
      default: "Assessment",
    },

    instructions: {
      type: String,
      default: "",
    },

    paper: {
      type: String,
      enum: ["paper1", "paper2"],
      default: "paper1",
    },

    score: {
      type: Number,
      required: true,
    },

    total: {
      type: Number,
      required: true,
    },

    percent: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["PASS", "FAIL"],
      required: true,
    },

    answers: {
      type: [AnswerSchema],
      default: [],
    },

    timeTakenSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },

    isAdminAttempt: {
      type: Boolean,
      default: false,
    },

    attemptNo: {
      type: Number,
      default: 1,
      min: 1,
    },

    attemptedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

/*
 * Learners: only one attempt per quiz.
 * Admin/tester attempts are excluded from this unique index.
 */
ResultSchema.index(
  { userId: 1, quizId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isAdminAttempt: { $ne: true },
    },
  }
);

export default mongoose.model("Result", ResultSchema);
