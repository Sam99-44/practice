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
        default: ""
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
        default: ""
    },

    priority: {
        type: String,
        enum: [
            "Low",
            "Medium",
            "High",
            "Urgent"
        ],
        default: "Medium"
    },

    status: {
        type: String,
        enum: [
            "Pending",
            "In Progress",
            "Completed",
            "Cancelled"
        ],
        default: "Pending"
    },

    progress: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },

    dueDate: {
        type: Date
    },

    completedAt: {
        type: Date,
        default: null
    },

    notes: {
        type: String,
        default: ""
    }

},
{
    timestamps: true
});

export default mongoose.model("Task", TaskSchema);
