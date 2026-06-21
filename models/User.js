import mongoose from "mongoose";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const saPhoneRegex = /^\+27[6-8][0-9]{8}$/;

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator(value) {
          return emailRegex.test(String(value || "").trim().toLowerCase());
        },
        message: "Please enter a valid email address.",
      },
    },

    passwordHash: { type: String, required: true },

    role: {
      type: String,
      enum: ["learner", "admin", "editor"],
      default: "learner",
    },

    accountType: {
      type: String,
      enum: ["learner", "practice", "guest"],
      required: true,
    },

    enrollmentStatus: {
      type: String,
      enum: ["not_required", "pending", "enrolled"],
      default: "not_required",
    },

    grade: { type: Number, default: null, min: 8, max: 12 },

    curriculum: {
      type: String,
      enum: ["NCS", "IEB", ""],
      default: "",
      trim: true,
    },

    guestReasons: { type: [String], default: [] },

    otherReason: {
      type: String,
      default: "",
      maxlength: 120,
      trim: true,
    },

    guestMessage: {
      type: String,
      default: "",
      maxlength: 255,
      trim: true,
    },

    studentNumber: { type: String, default: null },

    learnerNumber: { type: String, unique: true, sparse: true },

    fullName: { type: String, trim: true, default: "" },
    profileHeadline: { type: String, trim: true, default: "" },
    profilePhoto: { type: String, trim: true, default: "" },

    province: { type: String, default: "", trim: true },
    district: { type: String, default: "", trim: true },

    gender: {
      type: String,
      enum: ["female", "male", "prefer_not_to_say", "other", ""],
      default: "",
    },

    cellphone: {
      type: String,
      required: true,
      trim: true,
    },

    phoneVerified: {
      type: Boolean,
      default: false,
    },

    phoneOtpHash: {
      type: String,
      default: null,
    },

    phoneOtpExpiresAt: {
      type: Date,
      default: null,
    },

    phoneVerifiedAt: {
      type: Date,
      default: null,
    },

    guardianCellphone: { type: String, default: "", trim: true },

    emailVerified: { type: Boolean, default: false },
    verifyTokenHash: { type: String, default: null },
    verifyTokenExpiresAt: { type: Date, default: null },

    trialActive: { type: Boolean, default: true },
    trialStartDate: { type: Date, default: null },
    trialEndDate: { type: Date, default: null },
    trialExpiredAt: { type: Date, default: null },

    premium: { type: Boolean, default: false },
    premiumActivatedAt: { type: Date, default: null },
    premiumExpiresAt: { type: Date, default: null },

    subscriptionStatus: {
      type: String,
      enum: ["none", "active", "expired"],
      default: "none",
    },

    paidUntil: { type: Date, default: null },
    lastPaymentId: { type: String, default: "" },

    resetPasswordTokenHash: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

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

  const diff = new Date(this.trialEndDate).getTime() - Date.now();
  if (diff <= 0) return 0;

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

UserSchema.pre("validate", function (next) {
  if (this.email) this.email = String(this.email).trim().toLowerCase();
  if (this.username) this.username = String(this.username).trim();
  if (this.fullName) this.fullName = String(this.fullName).trim();
  if (this.profileHeadline) this.profileHeadline = String(this.profileHeadline).trim();
  if (this.profilePhoto) this.profilePhoto = String(this.profilePhoto).trim();
  if (this.otherReason) this.otherReason = String(this.otherReason).trim();
  if (this.guestMessage) this.guestMessage = String(this.guestMessage).trim();

  if (this.cellphone) {
    this.cellphone = String(this.cellphone).replace(/\s+/g, "").trim();
  }

  if (this.guardianCellphone) {
    this.guardianCellphone = String(this.guardianCellphone).replace(/\s+/g, "").trim();
  }

  if (!this.cellphone) {
    return next(new Error("Cellphone number is required."));
  }

  if (!saPhoneRegex.test(this.cellphone)) {
    return next(
      new Error("Please enter a valid South African cellphone number. Example: +27821234567")
    );
  }

  if (this.guardianCellphone && !saPhoneRegex.test(this.guardianCellphone)) {
    return next(
      new Error("Please enter a valid guardian cellphone number. Example: +27821234567")
    );
  }

  if (this.accountType === "learner" || this.accountType === "practice") {
    if (this.grade === null || this.grade === undefined || this.grade === "") {
      return next(new Error("Grade is required for learner and practice accounts."));
    }

    if (!this.curriculum) {
      return next(new Error("Curriculum is required for learner and practice accounts."));
    }
  }

  if (this.accountType === "learner") {
    this.enrollmentStatus = this.enrollmentStatus || "pending";
  }

  if (this.accountType === "practice") {
    this.enrollmentStatus = "not_required";
    this.guardianCellphone = "";
  }

  if (this.accountType === "guest") {
    this.grade = null;
    this.curriculum = "";
    this.gender = "";
    this.studentNumber = null;
    this.learnerNumber = undefined;
    this.guardianCellphone = "";
    this.enrollmentStatus = "not_required";

    if (!this.province) {
      return next(new Error("Province is required for guest accounts."));
    }

    if (!this.district) {
      return next(new Error("District is required for guest accounts."));
    }

    if (!Array.isArray(this.guestReasons) || this.guestReasons.length === 0) {
      return next(new Error("Please select at least one reason for visiting."));
    }

    if (this.guestReasons.includes("other") && !String(this.otherReason || "").trim()) {
      return next(new Error("Please specify your reason for visiting."));
    }

    if (String(this.otherReason || "").length > 120) {
      return next(new Error("Other reason cannot exceed 120 characters."));
    }

    if (String(this.guestMessage || "").length > 255) {
      return next(new Error("Guest message cannot exceed 255 characters."));
    }
  }

  next();
});

export default mongoose.model("User", UserSchema);
