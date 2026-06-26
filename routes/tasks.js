import express from "express";
import Task from "../models/Task.js";
import Employee from "../models/Employee.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate("assignedTo", "fullName username email role department")
      .populate("assignedBy", "fullName username email role department")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    console.error("GET /api/tasks error:", error);
    res.status(500).json({ message: "Could not load tasks." });
  }
});

router.post("/", async (req, res) => {
  try {
    const task = await Task.create({
      title: req.body.title,
      description: req.body.description || "",
      assignedTo: req.body.assignedTo,
      assignedBy: req.body.assignedBy || req.body.createdBy || req.body.assignedTo,
      department: req.body.department || "",
      priority: req.body.priority || "Medium",
      status: req.body.status || "Pending",
      progress: Number(req.body.progress || 0),
      dueDate: req.body.dueDate || null,
      notes: req.body.notes || ""
    });

    res.status(201).json(task);
  } catch (error) {
    console.error("POST /api/tasks error:", error);
    res.status(500).json({ message: "Could not create task." });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const allowedUpdates = {};

    [
      "title",
      "description",
      "assignedTo",
      "assignedBy",
      "department",
      "priority",
      "status",
      "progress",
      "dueDate",
      "notes"
    ].forEach(field => {
      if (req.body[field] !== undefined) {
        allowedUpdates[field] = req.body[field];
      }
    });

    if (allowedUpdates.progress !== undefined) {
      allowedUpdates.progress = Number(allowedUpdates.progress);
    }

    if (allowedUpdates.progress >= 100) {
      allowedUpdates.status = "Completed";
      allowedUpdates.completedAt = new Date();
    }

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { $set: allowedUpdates },
      { new: true, runValidators: true }
    );

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    res.json(task);
  } catch (error) {
    console.error("PATCH /api/tasks/:id error:", error);
    res.status(500).json({ message: "Could not update task." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    res.json({ message: "Task deleted successfully." });
  } catch (error) {
    console.error("DELETE /api/tasks/:id error:", error);
    res.status(500).json({ message: "Could not delete task." });
  }
});

router.get("/employees/list", async (req, res) => {
  try {
    const employees = await Employee.find({})
      .select("_id fullName username email role department")
      .sort({ fullName: 1, username: 1 });

    res.json(employees);
  } catch (error) {
    console.error("GET /api/tasks/employees/list error:", error);
    res.status(500).json({ message: "Could not load employees." });
  }
});

export default router;
