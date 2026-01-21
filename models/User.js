// models/User.js
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },

    role: { type: String, enum: ["learner", "admin"], default: "learner" },
    grade: { type: Number, required: true, min: 8, max: 12 },

    /* ✅ Email verification */
    emailVerified: { type: Boolean, default: false },
    verifyTokenHash: { type: String, default: "" },
    verifyTokenExpiresAt: { type: Date, default: null },

    // ✅ Premium subscription fields (R95 for 30 days)
    premium: { type: Boolean, default: false },
    premiumActivatedAt: { type: Date, default: null },
    premiumExpiresAt: { type: Date, default: null },

    // ✅ Forgot password fields
    resetPasswordTokenHash: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("User", UserSchema);
