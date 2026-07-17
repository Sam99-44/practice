// models/Quiz.js

import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["mcq", "text", "dropdown", "fill", "note"],
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

    imageAlt: {
      type: String,
      default: "",
      trim: true,
    },

    imageSource: {
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
        validator(value) {
          if (this.type === "note") return value === 0;
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
        validator(options) {
          if (this.type === "mcq" || this.type === "dropdown") {
            return (
              Array.isArray(options) &&
              options.length >= 2 &&
              options.every((option) => String(option || "").trim().length > 0)
            );
          }
          return true;
        },
        message:
          "MCQ and dropdown questions must have at least 2 non-empty options.",
      },
    },

    correctIndex: {
      type: Number,
      default: -1,
      min: -1,
      validate: {
        validator(value) {
          if (this.type !== "mcq") return true;

          const usesMultiSelect =
            Boolean(this.isMultiSelect) ||
            (Array.isArray(this.correctIndexes) && this.correctIndexes.length > 0);

          if (usesMultiSelect) {
            return Number.isInteger(value) && value >= -1;
          }

          if (!Number.isInteger(value) || value < 0) return false;

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
        validator(indexes) {
          if (this.type !== "mcq") return true;
          if (!Array.isArray(indexes)) return false;
          if (indexes.length === 0) return true;

          const allIndexesAreValid = indexes.every(
            (index) => Number.isInteger(index) && index >= 0
          );

          if (!allIndexesAreValid) return false;

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
        validator(value) {
          const normalizedValue = String(value || "").trim();

          if (this.type === "text") {
            const fields = Array.isArray(this.answerFields)
              ? this.answerFields
              : [];
            return normalizedValue.length > 0 || fields.length > 0;
          }

          if (this.type === "dropdown") {
            if (!normalizedValue) return false;

            const normalizedOptions = Array.isArray(this.options)
              ? this.options.map((option) => String(option || "").trim())
              : [];

            return normalizedOptions.includes(normalizedValue);
          }

          return true;
        },
        message:
          "Text questions need a correct answer, and dropdown answers must match one of the options.",
      },
    },

    textAnswerMode: {
      type: String,
      enum: [
        "exact",
        "contains",
        "number_tolerance",
        "unordered",
        "expression",
      ],
      default: "exact",
    },

    numberTolerance: {
      type: Number,
      default: 0,
      min: 0,
    },

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

    answerFields: {
      type: [
        {
          key: { type: String, required: true, trim: true },
          prefix: { type: String, default: "", trim: true },
          suffix: { type: String, default: "", trim: true },
          correctAnswer: { type: String, default: "", trim: true },
        },
      ],
      default: [],
      validate: {
        validator(fields) {
          if (!Array.isArray(fields)) return false;

          const keys = fields
            .map((field) => String(field.key || "").trim())
            .filter(Boolean);

          if (new Set(keys).size !== keys.length) return false;

          if (this.type === "text") {
            return fields.every(
              (field) =>
                String(field.key || "").trim().length > 0 &&
                String(field.correctAnswer || "").trim().length > 0
            );
          }

          return true;
        },
        message:
          "Answer field keys must be unique and every text answer field must have a correct answer.",
      },
    },

    dropdownPlaceholder: {
      type: String,
      default: "Select an answer",
      trim: true,
    },

    fillAnswers: {
      type: [String],
      default: [],
      validate: {
        validator(answers) {
          if (this.type !== "fill") return true;

          return (
            Array.isArray(answers) &&
            answers.length > 0 &&
            answers.every((answer) => String(answer ?? "").trim().length > 0)
          );
        },
        message:
          "Fill-in-the-blank questions must have at least one non-empty answer.",
      },
    },

    allowPartialMarks: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: false,
  }
);

const QuizSchema = new mongoose.Schema(
  {
    assessmentCode: {
      type: String,
      default: undefined,
      trim: true,
      uppercase: true,
      index: true,
    },

    grade: {
      type: Number,
      required() {
        return this.contentType !== "weeklyChallenge";
      },
      min: 8,
      max: 12,
      default: null,
      index: true,
    },

    subject: {
      type: String,
      default: "Mathematics",
      trim: true,
      index: true,
    },

    curriculum: {
      type: String,
      default: "CAPS",
      trim: true,
      index: true,
    },

    language: {
      type: String,
      default: "English",
      trim: true,
      index: true,
    },

    term: {
      type: Number,
      min: 1,
      max: 4,
      default: 1,
      index: true,
    },

    chapter: {
      type: Number,
      min: 1,
      default: 1,
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

    subtopic: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    version: {
      type: String,
      default: "1.0",
      trim: true,
    },

    keywords: {
      type: [String],
      default: [],
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

    assessmentInstructions: {
      type: String,
      default: "",
      trim: true,
    },

    learningObjectives: {
      type: [String],
      default: [],
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

QuizSchema.virtual("questionCount").get(function () {
  return Array.isArray(this.questions)
    ? this.questions.filter((question) => question.type !== "note").length
    : 0;
});

QuizSchema.virtual("totalMarks").get(function () {
  if (!Array.isArray(this.questions)) return 0;

  return this.questions.reduce((total, question) => {
    if (question.type === "note") return total;
    return total + (Number(question.points) || 0);
  }, 0);
});

QuizSchema.virtual("mcqCount").get(function () {
  return Array.isArray(this.questions)
    ? this.questions.filter((question) => question.type === "mcq").length
    : 0;
});

QuizSchema.virtual("textCount").get(function () {
  return Array.isArray(this.questions)
    ? this.questions.filter((question) => question.type === "text").length
    : 0;
});

QuizSchema.virtual("dropdownCount").get(function () {
  return Array.isArray(this.questions)
    ? this.questions.filter((question) => question.type === "dropdown").length
    : 0;
});

QuizSchema.virtual("fillCount").get(function () {
  return Array.isArray(this.questions)
    ? this.questions.filter((question) => question.type === "fill").length
    : 0;
});

QuizSchema.pre("validate", function (next) {
  const code = String(this.assessmentCode || "").trim().toUpperCase();
  this.assessmentCode = code || undefined;

  this.subject = String(this.subject || "Mathematics").trim() || "Mathematics";
  this.curriculum = String(this.curriculum || "CAPS").trim() || "CAPS";
  this.language = String(this.language || "English").trim() || "English";
  this.topic = String(this.topic || "").trim();
  this.subtopic = String(this.subtopic || "").trim();
  this.version = String(this.version || "1.0").trim() || "1.0";

  this.keywords = Array.isArray(this.keywords)
    ? [...new Set(this.keywords.map((k) => String(k || "").trim()).filter(Boolean))]
    : [];

  this.learningObjectives = Array.isArray(this.learningObjectives)
    ? this.learningObjectives
        .map((objective) => String(objective || "").trim())
        .filter(Boolean)
    : [];

  this.assessmentInstructions = String(
    this.assessmentInstructions || this.instructions || ""
  ).trim();

  this.instructions = String(
    this.instructions || this.assessmentInstructions || ""
  ).trim();

  if (this.contentType === "weeklyChallenge") {
    this.grade = null;
    this.audience = "all";
    this.isForAllLearners = true;
  } else {
    this.audience = "grade";
    this.isForAllLearners = false;
  }

  if (this.accessLevel === "premium") {
    this.isPremium = true;
    this.requiresPayment = true;
    this.accessFee = Math.max(0, Number(this.accessFee) || 0);
  } else {
    this.accessLevel = "standard";
    this.isPremium = false;
    this.requiresPayment = false;
    this.accessFee = 0;
  }

  if (Array.isArray(this.questions)) {
    this.questions.forEach((question) => {
      question.text = String(question.text || "").trim();
      question.imageUrl = String(question.imageUrl || "").trim();
      question.imageAlt = String(question.imageAlt || "").trim();
      question.imageSource = String(question.imageSource || "").trim();
      question.hint = String(question.hint || "").trim();
      question.solution = String(question.solution || "").trim();
      question.instruction = String(question.instruction || "").trim();
      question.answerPrefix = String(question.answerPrefix || "").trim();
      question.answerSuffix = String(question.answerSuffix || "").trim();
      question.unit = String(question.unit || question.answerSuffix || "").trim();

      if (question.type === "note") {
        question.points = 0;
        question.options = [];
        question.correctIndex = -1;
        question.correctIndexes = [];
        question.isMultiSelect = false;
        question.correctText = "";
        question.answerFields = [];
        question.fillAnswers = [];
        question.dropdownPlaceholder = "";
        question.allowPartialMarks = false;
        return;
      }

      if (question.type === "mcq") {
        question.options = Array.isArray(question.options)
          ? question.options.map((option) => String(option || "").trim()).filter(Boolean)
          : [];

        const validIndexes = Array.isArray(question.correctIndexes)
          ? [
              ...new Set(
                question.correctIndexes.filter(
                  (index) => Number.isInteger(index) && index >= 0
                )
              ),
            ]
          : [];

        question.correctIndexes = validIndexes;
        question.isMultiSelect = validIndexes.length > 1;

        if (validIndexes.length === 1) question.correctIndex = validIndexes[0];
        if (validIndexes.length > 1) question.correctIndex = -1;

        question.correctText = "";
        question.answerFields = [];
        question.fillAnswers = [];
        question.dropdownPlaceholder = "";
        question.allowPartialMarks = false;
      }

      if (question.type === "dropdown") {
        question.options = Array.isArray(question.options)
          ? question.options.map((option) => String(option || "").trim()).filter(Boolean)
          : [];

        question.correctText = String(question.correctText || "").trim();
        question.dropdownPlaceholder =
          String(question.dropdownPlaceholder || "Select an answer").trim() ||
          "Select an answer";

        question.correctIndex = -1;
        question.correctIndexes = [];
        question.isMultiSelect = false;
        question.answerFields = [];
        question.fillAnswers = [];
        question.allowPartialMarks = false;
      }

      if (question.type === "text") {
        question.options = [];
        question.correctIndex = -1;
        question.correctIndexes = [];
        question.isMultiSelect = false;
        question.fillAnswers = [];
        question.dropdownPlaceholder = "";
        question.allowPartialMarks = false;
        question.correctText = String(question.correctText || "").trim();

        question.answerFields = Array.isArray(question.answerFields)
          ? question.answerFields
              .map((field) => ({
                key: String(field.key || "").trim(),
                prefix: String(field.prefix || "").trim(),
                suffix: String(field.suffix || "").trim(),
                correctAnswer: String(field.correctAnswer || "").trim(),
              }))
              .filter(
                (field) => field.key.length > 0 && field.correctAnswer.length > 0
              )
          : [];
      }

      if (question.type === "fill") {
        question.options = [];
        question.correctIndex = -1;
        question.correctIndexes = [];
        question.isMultiSelect = false;
        question.correctText = "";
        question.answerFields = [];
        question.dropdownPlaceholder = "";

        question.fillAnswers = Array.isArray(question.fillAnswers)
          ? question.fillAnswers
              .map((answer) => String(answer ?? "").trim())
              .filter(Boolean)
          : [];

        question.allowPartialMarks = question.allowPartialMarks !== false;
      }
    });
  }

  next();
});

QuizSchema.index(
  { assessmentCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      assessmentCode: {
        $exists: true,
        $type: "string",
        $ne: "",
      },
    },
  }
);

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

QuizSchema.index({
  subject: 1,
  curriculum: 1,
  grade: 1,
  term: 1,
  chapter: 1,
  topic: 1,
  subtopic: 1,
  contentType: 1,
  difficulty: 1,
});

export default mongoose.model("Quiz", QuizSchema);
