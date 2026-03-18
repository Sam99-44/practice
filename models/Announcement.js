// models/Announcement.js
import mongoose from "mongoose";

const AnnouncementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    grade: {
      type: String,
      enum: ["grade8", "grade9", "grade10", "grade11", "grade12", "allGrades"],
      default: "allGrades",
      index: true,
    },

    category: {
      type: String,
      enum: ["general", "class", "quiz", "all"],
      required: true,
      default: "general",
      index: true,
    },

    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },

    sendToStudents: {
      type: Boolean,
      default: false,
    },

    urgentNotice: {
      type: Boolean,
      default: false,
    },

    // class fields
    meetingLink: {
      type: String,
      default: "",
      trim: true,
    },

    meetingDate: {
      type: String,
      default: "",
      trim: true,
    },

    meetingTime: {
      type: String,
      default: "",
      trim: true,
    },

    // quiz fields
    dueDate: {
      type: String,
      default: "",
      trim: true,
    },

    quizStatus: {
      type: String,
      default: "Open",
      trim: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    responses: [
      {
        student: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        response: {
          type: String,
          enum: ["accepted", "rejected"],
          required: true,
        },
        respondedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

AnnouncementSchema.index({ category: 1, grade: 1, isPublished: 1, createdAt: -1 });

const Announcement = mongoose.model("Announcement", AnnouncementSchema);
export default Announcement;
