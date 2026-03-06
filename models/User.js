// models/User.js
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },

    role: { type: String, enum: ["learner", "admin"], default: "learner" },

    // ✅ accountType + optional grade (required only for students)
    accountType: { type: String, enum: ["student", "materials"], required: true },
    grade: { type: Number, default: null, min: 8, max: 12 },

    // ✅ 8-digit student number (students only)
    studentNumber: { type: String, default: null },

    // ✅ LOCATION + PROFILE FIELDS
    province: { type: String, default: "" },
    district: { type: String, default: "" },
    gender: {
      type: String,
      enum: ["female", "male", "nonbinary", "other", ""],
      default: "",
    },

    cellphone: { type: String, default: "" },
    guardianCellphone: { type: String, default: "" },

    // ✅ Email verification
    emailVerified: { type: Boolean, default: false },
    verifyTokenHash: { type: String, default: null },
    verifyTokenExpiresAt: { type: Date, default: null },

    // ✅ OLD premium fields (kept so nothing breaks)
    premium: { type: Boolean, default: false },
    premiumActivatedAt: { type: Date, default: null },
    premiumExpiresAt: { type: Date, default: null },

    // ✅ NEW monthly subscription fields for PayFast
    subscriptionStatus: {
      type: String,
      enum: ["none", "active", "expired"],
      default: "none",
    },
    paidUntil: { type: Date, default: null },
    lastPaymentId: { type: String, default: "" },

    // ✅ Forgot password fields
    resetPasswordTokenHash: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

// ✅ Ensure grade is provided only for student accounts
UserSchema.pre("validate", function (next) {
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
