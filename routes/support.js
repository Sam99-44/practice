import express from "express";
import Support from "../models/Support.js";

const router = express.Router();

/* ==========================================
   GET ALL SUPPORT REQUESTS
========================================== */
router.get("/", async (req, res) => {
  try {
    const requests = await Support.find()
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to load support requests"
    });
  }
});

/* ==========================================
   GET OPEN REQUESTS
========================================== */
router.get("/open", async (req, res) => {
  try {
    const requests = await Support.find({
      status: "open"
    }).sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to load open requests"
    });
  }
});

/* ==========================================
   GET IN PROGRESS REQUESTS
========================================== */
router.get("/in-progress", async (req, res) => {
  try {
    const requests = await Support.find({
      status: "in_progress"
    }).sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to load requests"
    });
  }
});

/* ==========================================
   GET RESOLVED REQUESTS
========================================== */
router.get("/resolved", async (req, res) => {
  try {
    const requests = await Support.find({
      status: "resolved"
    }).sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to load requests"
    });
  }
});

/* ==========================================
   CREATE SUPPORT REQUEST
========================================== */
router.post("/", async (req, res) => {
  try {
    const support = await Support.create(req.body);

    res.status(201).json({
      message: "Support request created",
      support
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to create request"
    });
  }
});

/* ==========================================
   UPDATE STATUS
========================================== */
router.put("/:id/status", async (req, res) => {
  try {

    const support = await Support.findByIdAndUpdate(
      req.params.id,
      {
        status: req.body.status
      },
      {
        new: true
      }
    );

    if (!support) {
      return res.status(404).json({
        message: "Request not found"
      });
    }

    res.json(support);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to update request"
    });
  }
});

/* ==========================================
   SUPPORT DASHBOARD STATS
========================================== */
router.get("/stats/dashboard", async (req, res) => {
  try {

    const total =
      await Support.countDocuments();

    const open =
      await Support.countDocuments({
        status: "open"
      });

    const inProgress =
      await Support.countDocuments({
        status: "in_progress"
      });

    const resolved =
      await Support.countDocuments({
        status: "resolved"
      });

    res.json({
      total,
      open,
      inProgress,
      resolved
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to load statistics"
    });
  }
});

export default router;
