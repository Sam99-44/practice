import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: "", trim: true },

    options: {
      type: [String],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 2,
        message: "A question must have at least 2 options",
      },
    },

    correctIndex: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const QuizSchema = new mongoose.Schema(
  {
    grade: { type: Number, required: true, min: 8, max: 12 },
    title: { type: String, required: true, trim: true },
    topic: { type: String, default: "", trim: true },

    // ✅ NEW: instructions shown before starting
    instructions: { type: String, default: "", trim: true },

    // ✅ time limit per assessment (minutes)
    timeLimitMinutes: { type: Number, default: 10, min: 1, max: 180 },

    // ✅ availability controls
    isFrozen: { type: Boolean, default: false },
    frozenAt: { type: Date, default: null },

    availableFrom: { type: Date, default: null },   // if set, learner can only attempt after this date
    availableUntil: { type: Date, default: null },  // if set, learner can only attempt before this date

    questions: { type: [QuestionSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Quiz", QuizSchema);
