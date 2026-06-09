import mongoose from "mongoose";

const SupportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    username: {
      type: String,
      default: "",
      trim: true,
    },

    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      index: true,
    },

    grade: {
      type: Number,
      default: null,
      min: 8,
      max: 12,
      index: true,
    },

    subject: {
      type: String,
      default: "Maths",
      trim: true,
      index: true,
    },

    requestType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    topics: {
      type: [String],
      default: [],
    },

    message: {
      type: String,
      default: "",
      trim: true,
    },

    wantExtraClasses: {
      type: Boolean,
      default: false,
    },

    preferredService: {
      type: String,
      default: "",
      trim: true,
    },

    contact: {
      type: String,
      default: "",
      trim: true,
    },

    changeAccount: {
      currentAccountType: {
        type: String,
        default: "",
        trim: true,
      },

      newAccountType: {
        type: String,
        default: "",
        trim: true,
      },

      newGrade: {
        type: Number,
        default: null,
      },

      contact: {
        type: String,
        default: "",
        trim: true,
      },
    },

    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Urgent"],
      default: "Medium",
      index: true,
    },

    contacted: {
      type: Boolean,
      default: false,
      index: true,
    },

    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },

    assignedTo: {
      type: String,
      default: "Support team",
      trim: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "New",
        "In Progress",
        "Waiting for Learner",
        "Escalated",
        "Resolved",
        "Closed",
      ],
      default: "New",
      index: true,
    },
  },
  { timestamps: true }
);

SupportSchema.pre("validate", function (next) {
  if (this.status === "Resolved" || this.status === "Closed") {
    this.resolved = true;
  }

  next();
});

SupportSchema.index({ createdAt: -1 });
SupportSchema.index({ status: 1 });
SupportSchema.index({ priority: 1 });
SupportSchema.index({ status: 1, priority: 1 });
SupportSchema.index({ email: 1, createdAt: -1 });

const Support =
  mongoose.models.Support ||
  mongoose.model("Support", SupportSchema);

export default Support;
