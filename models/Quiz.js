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

    text: {
      type: String,
      required: true,
      trim: true,
    },

    imageUrl: {
      type: String,
      default: "",
      trim: true,
    },

    hint: {
      type: String,
      default: "",
      trim: true,
    },

    solution: {
      type: String,
      default: "",
      trim: true,
    },

    points: {
      type: Number,
      default: 1,
      min: 0,
      validate: {
        validator: function (value) {
          if (this.type === "note") {
            return value === 0;
          }

          return Number.isInteger(value) && value >= 1;
        },
        message:
          "Points must be a whole number of 1 or more for questions, and 0 for notes.",
      },
    },

    options: {
      type: [String],
      default: [],
      validate: {
        validator: function (options) {
          if (this.type === "mcq") {
            return Array.isArray(options) && options.length >= 2;
          }

          return true;
        },
        message: "An MCQ question must have at least 2 options.",
      },
    },

    correctIndex: {
      type: Number,
      default: -1,
      min: -1,
      validate: {
        validator: function (value) {
          if (this.type !== "mcq") {
            return true;
          }

          const usesMultiSelect =
            Boolean(this.isMultiSelect) ||
            (Array.isArray(this.correctIndexes) &&
              this.correctIndexes.length > 0);

          if (usesMultiSelect) {
            return Number.isInteger(value) && value >= -1;
          }

          if (!Number.isInteger(value) || value < 0) {
            return false;
          }

          const optionsLength = Array.isArray(this.options)
            ? this.options.length
            : 0;

          return optionsLength >= 2 ? value < optionsLength : true;
        },
        message: "MCQ correctIndex must be valid within the options.",
      },
    },

    correctIndexes: {
      type: [Number],
      default: [],
      validate: {
        validator: function (indexes) {
          if (this.type !== "mcq") {
            return true;
          }

          if (!Array.isArray(indexes)) {
            return false;
          }

          if (indexes.length === 0) {
            return true;
          }

          const allIndexesAreValid = indexes.every(
            (index) => Number.isInteger(index) && index >= 0
          );

          if (!allIndexesAreValid) {
            return false;
          }

          const optionsLength = Array.isArray(this.options)
            ? this.options.length
            : 0;

          if (
            optionsLength >= 2 &&
            indexes.some((index) => index >= optionsLength)
          ) {
            return false;
          }

          return new Set(indexes).size === indexes.length;
        },
        message: "correctIndexes must contain valid unique option indexes.",
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
        validator: function (value) {
          if (this.type === "text") {
            return String(value || "").trim().length > 0;
          }

          return true;
        },
        message: "Typed-answer questions must have a correctText value.",
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
  {
    _id: false,
  }
);

const QuizSchema = new mongoose.Schema(
  {
    /*
     * Automatically generated assessment code.
     *
     * Example:
     * MAT11-P1-0001
     * MAT11-P1-0002
     * MAT12-P2-0001
     */
    assessmentCode: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      index: true,
    },

    grade: {
      type: Number,
      required: function () {
        return this.contentType !== "weeklyChallenge";
      },
      min: 8,
      max: 12,
      default: null,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    topic: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

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

    /*
     * Quiz access:
     *
     * standard = all permitted learners can access the quiz
     * premium  = only learners with paid access can open the quiz
     */
    accessLevel: {
      type: String,
      enum: ["standard", "premium"],
      default: "standard",
      required: true,
      index: true,
    },

    isPremium: {
      type: Boolean,
      default: false,
      index: true,
    },

    requiresPayment: {
      type: Boolean,
      default: false,
      index: true,
    },

    /*
     * Optional price for a premium quiz.
     *
     * Use 0 when access is controlled by a general subscription.
     * Store the value as a normal number, for example 50.
     */
    accessFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    paper: {
      type: String,
      enum: ["paper1", "paper2"],
      default: "paper1",
      trim: true,
      index: true,
    },

    difficulty: {
      type: String,
      enum: ["easy", "moderate", "hard"],
      default: "moderate",
      trim: true,
      index: true,
    },

    timeLimitMinutes: {
      type: Number,
      default: 10,
      min: 1,
      max: 180,
    },

    instructions: {
      type: String,
      default: "",
      trim: true,
    },

    isFrozen: {
      type: Boolean,
      default: false,
    },

    frozenAt: {
      type: Date,
      default: null,
    },

    availableFrom: {
      type: Date,
      default: null,
    },

    availableUntil: {
      type: Date,
      default: null,
    },

    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    publishAt: {
      type: Date,
      default: null,
      index: true,
    },

    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    sendPublishEmail: {
      type: Boolean,
      default: false,
    },

    questions: {
      type: [QuestionSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

/*
 * Normalise quiz values before validation.
 */
QuizSchema.pre("validate", function (next) {
  if (this.assessmentCode) {
    this.assessmentCode = String(this.assessmentCode)
      .trim()
      .toUpperCase();
  }

  if (this.contentType === "weeklyChallenge") {
    this.grade = null;
    this.audience = "all";
    this.isForAllLearners = true;
  } else {
    this.audience = "grade";
    this.isForAllLearners = false;
  }

  /*
   * Keep the premium fields consistent.
   * accessLevel is the main field used to control quiz access.
   */
  if (this.accessLevel === "premium") {
    this.isPremium = true;
    this.requiresPayment = true;
  } else {
    this.accessLevel = "standard";
    this.isPremium = false;
    this.requiresPayment = false;
    this.accessFee = 0;
  }

  /*
   * Notes do not carry marks or answers.
   */
  if (Array.isArray(this.questions)) {
    this.questions.forEach((question) => {
      if (question.type === "note") {
        question.points = 0;
        question.options = [];
        question.correctIndex = -1;
        question.correctIndexes = [];
        question.isMultiSelect = false;
        question.correctText = "";
      }

      if (question.type === "mcq") {
        const validIndexes = Array.isArray(question.correctIndexes)
          ? [...new Set(question.correctIndexes)]
          : [];

        question.correctIndexes = validIndexes;
        question.isMultiSelect = validIndexes.length > 1;

        if (validIndexes.length === 1) {
          question.correctIndex = validIndexes[0];
        }

        if (validIndexes.length > 1) {
          question.correctIndex = -1;
        }
      }

      if (question.type === "text") {
        question.options = [];
        question.correctIndex = -1;
        question.correctIndexes = [];
        question.isMultiSelect = false;
      }
    });
  }

  next();
});

/*
 * Useful indexes for displaying quizzes on learner pages.
 */
QuizSchema.index({
  contentType: 1,
  grade: 1,
  isPublished: 1,
  accessLevel: 1,
  createdAt: -1,
});

QuizSchema.index({
  audience: 1,
  isPublished: 1,
  accessLevel: 1,
  createdAt: -1,
});

export default mongoose.model("Quiz", QuizSchema);
