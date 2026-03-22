// models/User.js
import mongoose from "mongoose";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (value) {
          return emailRegex.test(String(value || "").trim().toLowerCase());
        },
        message: "Please enter a valid email address.",
      },
    },

    passwordHash: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["learner", "admin", "editor", "tester"],
      default: "learner",
    },

    accountType: {
      type: String,
      enum: ["student", "materials"],
      required: true,
    },

    grade: {
      type: Number,
      default: null,
      min: 8,
      max: 12,
    },

    // learner / materials number
    studentNumber: {
      type: String,
      default: null,
      trim: true,
    },

    // =========================
    // BASIC PROFILE FIELDS
    // =========================
    fullName: {
      type: String,
      trim: true,
      default: "",
    },

    firstName: {
      type: String,
      trim: true,
      default: "",
    },

    surname: {
      type: String,
      trim: true,
      default: "",
    },

    schoolName: {
      type: String,
      trim: true,
      default: "",
    },

    currentMarkRange: {
      type: String,
      enum: ["", "0-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-100"],
      default: "",
    },

    profileHeadline: {
      type: String,
      trim: true,
      default: "",
    },

    profilePhoto: {
      type: String,
      trim: true,
      default: "",
    },

    // =========================
    // LOCATION / CONTACT
    // =========================
    province: {
      type: String,
      trim: true,
      default: "",
    },

    district: {
      type: String,
      trim: true,
      default: "",
    },

    gender: {
      type: String,
      enum: ["female", "male", "nonbinary", "other", ""],
      default: "",
    },

    cellphone: {
      type: String,
      trim: true,
      default: "",
    },

    guardianCellphone: {
      type: String,
      trim: true,
      default: "",
    },

    // =========================
    // EMAIL VERIFICATION
    // =========================
    emailVerified: {
      type: Boolean,
      default: false,
    },

    verifyTokenHash: {
      type: String,
      default: null,
    },

    verifyTokenExpiresAt: {
      type: Date,
      default: null,
    },

    // =========================
    // FREE TRIAL FIELDS
    // =========================
    trialActive: {
      type: Boolean,
      default: true,
    },

    trialStartDate: {
      type: Date,
      default: null,
    },

    trialEndDate: {
      type: Date,
      default: null,
    },

    trialExpiredAt: {
      type: Date,
      default: null,
    },

    // =========================
    // PAID ACCESS FIELDS
    // =========================
    premium: {
      type: Boolean,
      default: false,
    },

    premiumActivatedAt: {
      type: Date,
      default: null,
    },

    premiumExpiresAt: {
      type: Date,
      default: null,
    },

    subscriptionStatus: {
      type: String,
      enum: ["none", "active", "expired"],
      default: "none",
    },

    paidUntil: {
      type: Date,
      default: null,
    },

    lastPaymentId: {
      type: String,
      default: "",
    },

    // =========================
    // FORGOT PASSWORD
    // =========================
    resetPasswordTokenHash: {
      type: String,
      default: null,
    },

    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// =========================
// VIRTUALS
// =========================
UserSchema.virtual("accessStatus").get(function () {
  const now = new Date();

  if (
    this.subscriptionStatus === "active" ||
    this.premium === true ||
    (this.paidUntil && new Date(this.paidUntil) > now) ||
    (this.premiumExpiresAt && new Date(this.premiumExpiresAt) > now)
  ) {
    return "active";
  }

  if (this.trialActive && this.trialEndDate && new Date(this.trialEndDate) >= now) {
    return "trial";
  }

  return "expired";
});

UserSchema.virtual("trialDaysLeft").get(function () {
  if (!this.trialEndDate) return 0;

  const now = new Date();
  const end = new Date(this.trialEndDate);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return 0;

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// =========================
// PRE-VALIDATE
// =========================
UserSchema.pre("validate", function (next) {
  if (this.email) {
    this.email = String(this.email).trim().toLowerCase();
  }

  if (this.username) {
    this.username = String(this.username).trim();
  }

  if (this.firstName) {
    this.firstName = String(this.firstName).trim();
  }

  if (this.surname) {
    this.surname = String(this.surname).trim();
  }

  if (this.schoolName) {
    this.schoolName = String(this.schoolName).trim();
  }

  if (this.fullName) {
    this.fullName = String(this.fullName).trim();
  }

  if (this.profileHeadline) {
    this.profileHeadline = String(this.profileHeadline).trim();
  }

  if (this.profilePhoto) {
    this.profilePhoto = String(this.profilePhoto).trim();
  }

  if (this.province) {
    this.province = String(this.province).trim();
  }

  if (this.district) {
    this.district = String(this.district).trim();
  }

  if (this.cellphone) {
    this.cellphone = String(this.cellphone).trim();
  }

  if (this.guardianCellphone) {
    this.guardianCellphone = String(this.guardianCellphone).trim();
  }

  // build fullName from firstName + surname if fullName is empty
  if (!this.fullName) {
    this.fullName = [this.firstName, this.surname].filter(Boolean).join(" ").trim();
  }

  // student accounts must have grade
  if (this.accountType === "student") {
    if (this.grade === null || this.grade === undefined || this.grade === "") {
      return next(new Error("Grade is required for student accounts."));
    }
  } else {
    this.grade = null;
  }

  next();
});

export default mongoose.model("User", UserSchema);
