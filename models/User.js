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
      enum: ["learner", "admin", "editor"],
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

    // 8-digit student number (legacy)
    studentNumber: {
      type: String,
      default: null,
    },

    // ✅ NEW: learner number (PO26xxxxx)
    learnerNumber: {
      type: String,
      unique: true,
      sparse: true,
    },

    // profile fields
    fullName: {
      type: String,
      trim: true,
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

    // location + profile fields
    province: {
      type: String,
      default: "",
    },

    district: {
      type: String,
      default: "",
    },

    gender: {
      type: String,
      enum: ["female", "male", "nonbinary", "other", ""],
      default: "",
    },

    cellphone: {
      type: String,
      default: "",
    },

    guardianCellphone: {
      type: String,
      default: "",
    },

    // Email verification
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

    // Forgot password
    resetPasswordTokenHash: {
      type: String,
      default: null,
    },

    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
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
// PRE-VALIDATION
// =========================

UserSchema.pre("validate", function (next) {
  if (this.email) {
    this.email = String(this.email).trim().toLowerCase();
  }

  if (this.username) {
    this.username = String(this.username).trim();
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

  if (this.accountType === "student") {
    if (this.grade === null || this.grade === undefined || this.grade === "") {
      return next(new Error("Grade is required for student accounts."));
    }
  } else {
    this.grade = null;
    this.studentNumber = null;
  }

  next();
});

export default mongoose.model("User", UserSchema);
