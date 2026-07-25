import express from "express";
import mongoose from "mongoose";
import InternalReview from "../models/InternalReview.js";

const router = express.Router();

const REVIEWER_NAMES = new Set([
  "Jessey",
  "Mulamuleli",
  "Takalani",
  "Ndamulelo",
]);

const QUALITY_VALUES = new Set([
  "poor",
  "needs_improvement",
  "good",
  "excellent",
]);

function text(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function reviewerName(value) {
  const name = text(value, 120);
  return REVIEWER_NAMES.has(name) ? name : "";
}

function quality(value) {
  const item = text(value, 40).toLowerCase();
  return QUALITY_VALUES.has(item) ? item : null;
}

function checked(value) {
  const item = text(value, 10).toLowerCase();
  return item === "yes" || item === "no" ? item : null;
}

function rating(value) {
  if (value === null || value === undefined || value === "") return null;
  const item = Number(value);
  return Number.isInteger(item) && item >= 1 && item <= 5
    ? item
    : null;
}

function serialize(review) {
  return {
    status: review?.reviewStatus || "pending",
    reviewerName: review?.latestReviewerName || "",
    quality: review?.latestQuality || "",
    checked: review?.latestChecked || "",
    rating: review?.latestRating ?? null,
    comment: review?.latestComment || "",
    reviewedAt: review?.reviewedAt || null,
  };
}

function serializeComments(review) {
  return Array.isArray(review?.reviews)
    ? review.reviews.map((entry) => ({
        _id: entry._id,
        author: entry.reviewerName,
        authorName: entry.reviewerName,
        reviewerRole: entry.reviewerRole,
        quality: entry.quality || "",
        checked: entry.checked || "",
        rating: entry.rating ?? null,
        comment: entry.comment || "",
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }))
    : [];
}

export default function createInternalReviewRoutes({
  authRequired,
  Quiz,
  User,
}) {
  async function adminOrEditor(req, res, next) {
    try {
      const user = await User.findById(req.user.userId)
        .select("role username fullName email")
        .lean();

      if (!user) {
        return res.status(401).json({ message: "User not found." });
      }

      const role = String(user.role || "").toLowerCase();

      if (!["admin", "editor"].includes(role)) {
        return res.status(403).json({
          message: "Only Admin and Editor accounts can use internal reviews.",
        });
      }

      req.internalReviewer = { ...user, role };
      next();
    } catch (error) {
      console.error("Internal review access check failed:", error);
      res.status(500).json({ message: "Server error." });
    }
  }

  router.get(
    "/api/quizzes/:id/internal-reviews",
    authRequired,
    adminOrEditor,
    async (req, res) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
          return res.status(400).json({ message: "Invalid assessment id." });
        }

        const review = await InternalReview.findOne({
          quizId: req.params.id,
        }).lean();

        res.json({
          reviewStatus: review?.reviewStatus || "pending",
          internalReview: serialize(review),
          comments: serializeComments(review),
        });
      } catch (error) {
        console.error("Load internal review failed:", error);
        res.status(500).json({
          message: "Could not load the internal review.",
        });
      }
    }
  );

  router.post(
    "/api/quizzes/:id/internal-reviews",
    authRequired,
    adminOrEditor,
    async (req, res) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
          return res.status(400).json({ message: "Invalid assessment id." });
        }

        const quiz = await Quiz.findById(req.params.id)
          .select(
            "_id assessmentCode grade title topic contentType difficulty " +
            "createdAt updatedAt isPublished isFrozen"
          )
          .lean();

        if (!quiz) {
          return res.status(404).json({ message: "Assessment not found." });
        }

        const selectedReviewer = reviewerName(req.body.reviewerName);

        if (!selectedReviewer) {
          return res.status(400).json({
            message:
              "Reviewed by is required and must be Jessey, Mulamuleli, Takalani or Ndamulelo.",
          });
        }

        const selectedQuality = quality(req.body.quality);
        const selectedChecked = checked(req.body.checked);
        const selectedRating = rating(req.body.rating);
        const comment = text(req.body.comment, 1000);

        if (req.body.quality && !selectedQuality) {
          return res.status(400).json({
            message:
              "Quality must be Poor, Needs Improvement, Good or Excellent.",
          });
        }

        if (req.body.checked && !selectedChecked) {
          return res.status(400).json({
            message: "Checked must be Yes or No.",
          });
        }

        if (
          req.body.rating !== null &&
          req.body.rating !== undefined &&
          req.body.rating !== "" &&
          !selectedRating
        ) {
          return res.status(400).json({
            message: "Star rating must be from 1 to 5.",
          });
        }

        /*
         * Reviewed by is the only required review field.
         * Quality, checked status, star rating and comment are optional.
         */
        const reviewer = req.internalReviewer;
        const now = new Date();

        const entry = {
          reviewerId: reviewer._id,
          reviewerName: selectedReviewer,
          reviewerRole: reviewer.role,
          quality: selectedQuality,
          checked: selectedChecked,
          rating: selectedRating,
          comment,
        };

        const setValues = {
          reviewStatus: "reviewed",
          latestReviewerId: reviewer._id,
          latestReviewerName: selectedReviewer,
          reviewedAt: now,
        };

        if (selectedQuality) setValues.latestQuality = selectedQuality;
        if (selectedChecked) setValues.latestChecked = selectedChecked;
        if (selectedRating) setValues.latestRating = selectedRating;
        if (comment) setValues.latestComment = comment;

        const saved = await InternalReview.findOneAndUpdate(
          { quizId: quiz._id },
          {
            $set: setValues,
            $push: { reviews: entry },
            $setOnInsert: { quizId: quiz._id },
          },
          {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          }
        ).lean();

        res.json({
          message: "Internal review saved.",
          quiz: {
            ...quiz,
            reviewStatus: "reviewed",
            internalReview: serialize(saved),
            ratingComments: serializeComments(saved),
          },
        });
      } catch (error) {
        console.error("Save internal review failed:", error);

        if (error?.name === "ValidationError") {
          return res.status(400).json({ message: error.message });
        }

        res.status(500).json({
          message: "Could not save the internal review.",
        });
      }
    }
  );

  /*
   * Register this router before the existing GET /api/quizzes route.
   * It intercepts only the internal-review request.
   */
  router.get(
    "/api/quizzes",
    authRequired,
    adminOrEditor,
    async (req, res, next) => {
      const includeInternal =
        String(req.query.includeInternalReviews || "").toLowerCase() === "true";

      const includeRatings =
        String(req.query.includeRatings || "").toLowerCase() === "true";

      if (!includeInternal && !includeRatings) return next();

      try {
        const quizzes = await Quiz.find({})
          .sort({ updatedAt: -1, createdAt: -1 })
          .select(
            "_id assessmentCode grade title topic contentType difficulty " +
            "createdAt updatedAt isPublished isFrozen"
          )
          .lean();

        const quizIds = quizzes.map((quiz) => quiz._id);

        const reviews = await InternalReview.find({
          quizId: { $in: quizIds },
        }).lean();

        const reviewMap = new Map(
          reviews.map((item) => [String(item.quizId), item])
        );

        let ratingRows = [];

        if (includeRatings && quizIds.length) {
          ratingRows = await mongoose.connection
            .collection("quizratings")
            .aggregate([
              { $match: { quizId: { $in: quizIds } } },
              {
                $group: {
                  _id: "$quizId",
                  average: { $avg: "$rating" },
                  count: { $sum: 1 },
                  five: {
                    $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] },
                  },
                  four: {
                    $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] },
                  },
                  three: {
                    $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] },
                  },
                  two: {
                    $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] },
                  },
                  one: {
                    $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] },
                  },
                },
              },
            ])
            .toArray();
        }

        const ratingMap = new Map(
          ratingRows.map((item) => [String(item._id), item])
        );

        res.json(
          quizzes.map((quiz) => {
            const review = reviewMap.get(String(quiz._id));
            const learner = ratingMap.get(String(quiz._id));

            return {
              ...quiz,
              reviewStatus: review?.reviewStatus || "pending",
              internalReview: serialize(review),
              ratingComments: serializeComments(review),
              ratingSummary: {
                average: learner?.average || 0,
                count: learner?.count || 0,
                distribution: {
                  5: learner?.five || 0,
                  4: learner?.four || 0,
                  3: learner?.three || 0,
                  2: learner?.two || 0,
                  1: learner?.one || 0,
                },
              },
            };
          })
        );
      } catch (error) {
        console.error("Load internal review list failed:", error);
        res.status(500).json({
          message: "Could not load internal review data.",
        });
      }
    }
  );

  return router;
}
