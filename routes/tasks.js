import express from "express";
import Task from "../models/Task.js";
import Employee from "../models/Employee.js";
import authRequired from "../middleware/authRequired.js";
import employeeAdminOnly from "../middleware/employeeAdminOnly.js";

const router = express.Router();


// =========================
// GET ALL TASKS
// =========================

router.get(
    "/",
    authRequired,
    async (req, res) => {

        try {

            const tasks = await Task.find()
                .populate("assignedTo", "fullName username department")
                .populate("assignedBy", "fullName username")
                .sort({ createdAt: -1 });

            res.json(tasks);

        } catch (err) {

            console.error(err);

            res.status(500).json({
                message: "Failed to load tasks."
            });

        }

    }
);


// =========================
// CREATE TASK
// =========================

router.post(
    "/",
    authRequired,
    employeeAdminOnly,
    async (req, res) => {

        try {

            const task = await Task.create({

                title: req.body.title,

                description: req.body.description,

                assignedTo: req.body.assignedTo,

                assignedBy: req.user._id,

                department: req.body.department,

                priority: req.body.priority,

                dueDate: req.body.dueDate,

                notes: req.body.notes

            });

            res.status(201).json(task);

        } catch (err) {

            console.error(err);

            res.status(500).json({
                message: "Failed to create task."
            });

        }

    }
);


// =========================
// UPDATE TASK
// =========================

router.patch(
    "/:id",
    authRequired,
    async (req, res) => {

        try {

            const task = await Task.findById(req.params.id);

            if (!task) {

                return res.status(404).json({
                    message: "Task not found."
                });

            }

            Object.assign(task, req.body);

            if (task.progress >= 100) {

                task.status = "Completed";

                task.completedAt = new Date();

            }

            await task.save();

            res.json(task);

        } catch (err) {

            console.error(err);

            res.status(500).json({
                message: "Failed to update task."
            });

        }

    }
);


// =========================
// DELETE TASK
// =========================

router.delete(
    "/:id",
    authRequired,
    employeeAdminOnly,
    async (req, res) => {

        try {

            const deleted = await Task.findByIdAndDelete(req.params.id);

            if (!deleted) {

                return res.status(404).json({
                    message: "Task not found."
                });

            }

            res.json({
                message: "Task deleted successfully."
            });

        } catch (err) {

            console.error(err);

            res.status(500).json({
                message: "Failed to delete task."
            });

        }

    }
);


// =========================
// EMPLOYEE LIST
// =========================

router.get(
    "/employees",
    authRequired,
    async (req, res) => {

        try {

            const employees = await Employee.find(
                {},
                "fullName username department email role"
            ).sort({
                fullName: 1
            });

            res.json(employees);

        } catch (err) {

            console.error(err);

            res.status(500).json({
                message: "Failed to load employees."
            });

        }

    }
);

export default router;
