// models/EmployeeLog.js

import mongoose from "mongoose";

const EmployeeLogSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    ipAddress: {
      type: String,
      default: "",
      trim: true,
    },

    userAgent: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

EmployeeLogSchema.index({ createdAt: -1 });
EmployeeLogSchema.index({ employee: 1, createdAt: -1 });

const EmployeeLog =
  mongoose.models.EmployeeLog || mongoose.model("EmployeeLog", EmployeeLogSchema);

export default EmployeeLog;
