import mongoose from "mongoose";

const AnnouncementSchema = new mongoose.Schema(
  {
    weeklyFocus: {
      type: String,
      default: "",
      trim: true,
    },

    grades: {
      grade8: {
        weeklyUpdate: { type: String, default: "" },
        meetingLink: { type: String, default: "" },
        quizAnnouncement: { type: String, default: "" },
      },
      grade9: {
        weeklyUpdate: { type: String, default: "" },
        meetingLink: { type: String, default: "" },
        quizAnnouncement: { type: String, default: "" },
      },
      grade10: {
        weeklyUpdate: { type: String, default: "" },
        meetingLink: { type: String, default: "" },
        quizAnnouncement: { type: String, default: "" },
      },
      grade11: {
        weeklyUpdate: { type: String, default: "" },
        meetingLink: { type: String, default: "" },
        quizAnnouncement: { type: String, default: "" },
      },
      grade12: {
        weeklyUpdate: { type: String, default: "" },
        meetingLink: { type: String, default: "" },
        quizAnnouncement: { type: String, default: "" },
      },
      allGrades: {
        weeklyUpdate: { type: String, default: "" },
        meetingLink: { type: String, default: "" },
        quizAnnouncement: { type: String, default: "" },
      },
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Announcement", AnnouncementSchema);
