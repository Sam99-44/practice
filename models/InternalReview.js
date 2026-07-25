import mongoose from "mongoose";

const ReviewEntrySchema = new mongoose.Schema(
  {
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reviewerName: {
      type: String,
      enum: ["Jessey", "Mulamuleli", "Takalani", "Ndamulelo"],
      required: true,
      trim: true,
    },
    reviewerRole: {
      type: String,
      enum: ["admin", "editor"],
      required: true,
    },
    quality: {
      type: String,
      enum: ["poor", "needs_improvement", "good", "excellent"],
      default: null,
    },
    checked: {
      type: String,
      enum: ["yes", "no"],
      default: null,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    comment: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

const InternalReviewSchema = new mongoose.Schema(
  {
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      unique: true,
      index: true,
    },
    reviewStatus: {
      type: String,
      enum: ["pending", "reviewed"],
      default: "pending",
      index: true,
    },
    latestReviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    latestReviewerName: {
      type: String,
      enum: ["Jessey", "Mulamuleli", "Takalani", "Ndamulelo", null],
      default: null,
    },
    latestQuality: {
      type: String,
      enum: ["poor", "needs_improvement", "good", "excellent", null],
      default: null,
    },
    latestChecked: {
      type: String,
      enum: ["yes", "no", null],
      default: null,
    },
    latestRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    latestComment: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    reviewedAt: {
      type: Date,
      default: null,
      index: true,
    },
    reviews: {
      type: [ReviewEntrySchema],
      default: [],
    },
  },
  { timestamps: true }
);

InternalReviewSchema.index({ reviewStatus: 1, reviewedAt: -1 });
InternalReviewSchema.index({ latestReviewerName: 1, latestQuality: 1 });

export default (
  mongoose.models.InternalReview ||
  mongoose.model("InternalReview", InternalReviewSchema)
);
