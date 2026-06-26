import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      default: "",
      trim: true
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true
    },

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true
    },

    department: {
      type: String,
      default: "General",
      trim: true
    },

    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Urgent"],
      default: "Medium"
    },

    status: {
      type: String,
      enum: ["New", "In Progress", "Waiting", "Completed", "Cancelled"],
      default: "New"
    },

    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },

    dueDate: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    },

    notes: {
      type: String,
      default: "",
      trim: true
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Task", TaskSchema);
