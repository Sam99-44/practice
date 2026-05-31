import mongoose from "mongoose";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EmployeeSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

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
      enum: [
        "admin",
        "tester",
        "academic",
        "editor",
        "operations",
        "finance",
        "support",
        "tutor",
      ],
      required: true,
      index: true,
    },

    department: {
      type: String,
      enum: [
        "academic",
        "operations",
        "finance",
        "support",
        "tutor",
        "admin",
      ],
      required: true,
      index: true,
    },

    employeeNumber: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    jobTitle: {
      type: String,
      trim: true,
      default: "",
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    emailVerified: {
      type: Boolean,
      default: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

EmployeeSchema.pre("validate", function (next) {
  if (this.email) {
    this.email = String(this.email).trim().toLowerCase();
  }

  if (this.username) {
    this.username = String(this.username).trim();
  }

  if (this.fullName) {
    this.fullName = String(this.fullName).trim();
  }

  if (this.role) {
    this.role = String(this.role).trim().toLowerCase();
  }

  if (this.department) {
    this.department = String(this.department).trim().toLowerCase();
  }

  next();
});

export default mongoose.model("Employee", EmployeeSchema);
