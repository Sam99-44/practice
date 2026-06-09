import express from "express";
import Support from "../models/Support.js";

import {
  employeeAuthRequired,
  departmentRequired,
  writeEmployeeLog,
} from "./employees.js";

const router = express.Router();

function normalizeStatus(value = "") {
  const v = String(value || "").trim().toLowerCase();

  if (v === "open" || v === "new") return "New";
  if (v === "in_progress" || v === "in progress") return "In Progress";
  if (v === "waiting" || v === "waiting for learner") return "Waiting for Learner";
  if (v === "escalated") return "Escalated";
  if (v === "resolved") return "Resolved";
  if (v === "closed") return "Closed";

  return "New";
}

function normalizePriority(value = "") {
  const v = String(value || "").trim().toLowerCase();

  if (v === "low") return "Low";
  if (v === "high") return "High";
  if (v === "urgent") return "Urgent";

  return "Medium";
}

/* ==========================================
   SUPPORT ADMIN: GET ALL SUPPORT REQUESTS
========================================== */
router.get(
  "/",
  employeeAuthRequired,
  departmentRequired("support"),
  async (req, res) => {
    try {
      const filter = {};

      if (req.query.status) {
        filter.status = normalizeStatus(req.query.status);
      }

      if (req.query.priority) {
        filter.priority = normalizePriority(req.query.priority);
      }

      if (req.query.contacted === "true") {
        filter.contacted = true;
      }

      if (req.query.contacted === "false") {
        filter.contacted = false;
      }

      if (req.query.resolved === "true") {
        filter.resolved = true;
      }

      if (req.query.resolved === "false") {
        filter.resolved = false;
      }

      if (req.query.q || req.query.search) {
        const term = String(req.query.q || req.query.search || "").trim();
        const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

        filter.$or = [
          { username: rx },
          { email: rx },
          { subject: rx },
          { requestType: rx },
          { message: rx },
          { contact: rx },
          { assignedTo: rx },
          { notes: rx },
        ];
      }

      const requests = await Support.find(filter).sort({ createdAt: -1 });

      res.json(requests);
    } catch (error) {
      console.error("GET /api/support error:", error);

      res.status(500).json({
        message: "Failed to load support requests.",
      });
    }
  }
);

/* ==========================================
   PUBLIC/STUDENT: CREATE SUPPORT REQUEST
========================================== */
router.post("/", async (req, res) => {
  try {
    const support = await Support.create({
      ...req.body,
      status: normalizeStatus(req.body.status || "New"),
      priority: normalizePriority(req.body.priority || "Medium"),
      contacted: !!req.body.contacted,
      resolved: !!req.body.resolved,
      assignedTo: req.body.assignedTo || "Support team",
      notes: req.body.notes || "",
    });

    res.status(201).json({
      message: "Support request created.",
      support,
    });
  } catch (error) {
    console.error("POST /api/support error:", error);

    res.status(500).json({
      message: "Failed to create request.",
    });
  }
});

/* ==========================================
   SUPPORT ADMIN: GET OPEN REQUESTS
========================================== */
router.get(
  "/open",
  employeeAuthRequired,
  departmentRequired("support"),
  async (req, res) => {
    try {
      const requests = await Support.find({
        status: "New",
      }).sort({ createdAt: -1 });

      res.json(requests);
    } catch (error) {
      console.error("GET /api/support/open error:", error);

      res.status(500).json({
        message: "Failed to load open requests.",
      });
    }
  }
);

/* ==========================================
   SUPPORT ADMIN: GET IN PROGRESS REQUESTS
========================================== */
router.get(
  "/in-progress",
  employeeAuthRequired,
  departmentRequired("support"),
  async (req, res) => {
    try {
      const requests = await Support.find({
        status: "In Progress",
      }).sort({ createdAt: -1 });

      res.json(requests);
    } catch (error) {
      console.error("GET /api/support/in-progress error:", error);

      res.status(500).json({
        message: "Failed to load requests.",
      });
    }
  }
);

/* ==========================================
   SUPPORT ADMIN: GET RESOLVED REQUESTS
========================================== */
router.get(
  "/resolved",
  employeeAuthRequired,
  departmentRequired("support"),
  async (req, res) => {
    try {
      const requests = await Support.find({
        status: "Resolved",
      }).sort({ createdAt: -1 });

      res.json(requests);
    } catch (error) {
      console.error("GET /api/support/resolved error:", error);

      res.status(500).json({
        message: "Failed to load requests.",
      });
    }
  }
);

/* ==========================================
   SUPPORT DASHBOARD STATS
========================================== */
router.get(
  "/stats/dashboard",
  employeeAuthRequired,
  departmentRequired("support"),
  async (req, res) => {
    try {
      const all = await Support.find({}).lean();

      const total = all.length;
      const open = all.filter((x) => normalizeStatus(x.status) === "New").length;
      const inProgress = all.filter(
        (x) => normalizeStatus(x.status) === "In Progress"
      ).length;
      const resolved = all.filter((x) =>
        ["Resolved", "Closed"].includes(normalizeStatus(x.status))
      ).length;
      const escalated = all.filter(
        (x) => normalizeStatus(x.status) === "Escalated"
      ).length;
      const contacted = all.filter((x) => x.contacted === true).length;

      res.json({
        total,
        open,
        newTickets: open,
        inProgress,
        resolved,
        escalated,
        contacted,
      });
    } catch (error) {
      console.error("GET /api/support/stats/dashboard error:", error);

      res.status(500).json({
        message: "Failed to load statistics.",
      });
    }
  }
);

/* ==========================================
   SUPPORT ADMIN: UPDATE SUPPORT REQUEST
========================================== */
router.patch(
  "/:id",
  employeeAuthRequired,
  departmentRequired("support"),
  async (req, res) => {
    try {
      const support = await Support.findById(req.params.id);

      if (!support) {
        return res.status(404).json({
          message: "Request not found.",
        });
      }

      if ("status" in req.body) {
        support.status = normalizeStatus(req.body.status);
      }

      if ("priority" in req.body) {
        support.priority = normalizePriority(req.body.priority);
      }

      if ("contacted" in req.body) {
        support.contacted = !!req.body.contacted;
      }

      if ("resolved" in req.body) {
        support.resolved = !!req.body.resolved;
      }

      if ("assignedTo" in req.body) {
        support.assignedTo = String(req.body.assignedTo || "").trim();
      }

      if ("notes" in req.body) {
        support.notes = String(req.body.notes || "").trim();
      }

      if ("message" in req.body) {
        support.message = String(req.body.message || "").trim();
      }

      if (support.status === "Resolved" || support.status === "Closed") {
        support.resolved = true;
      }

      await support.save();

      await writeEmployeeLog(req, "support_request_updated", {
        supportRequestId: support._id,
        status: support.status,
        priority: support.priority,
        contacted: support.contacted,
        resolved: support.resolved,
      });

      res.json({
        message: "Support request updated.",
        support,
      });
    } catch (error) {
      console.error("PATCH /api/support/:id error:", error);

      res.status(500).json({
        message: "Failed to update request.",
      });
    }
  }
);

/* ==========================================
   BACKWARD COMPATIBILITY: UPDATE STATUS ONLY
========================================== */
router.put(
  "/:id/status",
  employeeAuthRequired,
  departmentRequired("support"),
  async (req, res) => {
    try {
      const support = await Support.findByIdAndUpdate(
        req.params.id,
        {
          status: normalizeStatus(req.body.status),
        },
        {
          new: true,
        }
      );

      if (!support) {
        return res.status(404).json({
          message: "Request not found.",
        });
      }

      await writeEmployeeLog(req, "support_status_updated", {
        supportRequestId: support._id,
        status: support.status,
      });

      res.json(support);
    } catch (error) {
      console.error("PUT /api/support/:id/status error:", error);

      res.status(500).json({
        message: "Failed to update request.",
      });
    }
  }
);

/* ==========================================
   SUPPORT ADMIN: DELETE SUPPORT REQUEST
========================================== */
router.delete(
  "/:id",
  employeeAuthRequired,
  departmentRequired("support"),
  async (req, res) => {
    try {
      const support = await Support.findById(req.params.id);

      if (!support) {
        return res.status(404).json({
          message: "Request not found.",
        });
      }

      await Support.deleteOne({
        _id: support._id,
      });

      await writeEmployeeLog(req, "support_request_deleted", {
        supportRequestId: support._id,
        email: support.email,
      });

      res.json({
        message: "Support request deleted.",
      });
    } catch (error) {
      console.error("DELETE /api/support/:id error:", error);

      res.status(500).json({
        message: "Failed to delete request.",
      });
    }
  }
);

export default router;
