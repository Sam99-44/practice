import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

import Opportunity from "../models/Opportunity.js";
import OpportunityApplication from "../models/OpportunityApplication.js";

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({
  storage: multer.memoryStorage()
});

function uploadToCloudinary(fileBuffer, folder, originalName) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        public_id: `${Date.now()}-${originalName.replace(/\s+/g, "-")}`
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(fileBuffer);
  });
}

/* =========================
   PUBLIC: GET OPEN JOBS
========================= */

router.get("/", async (req, res) => {
  try {
    const opportunities = await Opportunity.find({ status: "Open" })
      .sort({ createdAt: -1 });

    res.json(opportunities);
  } catch (err) {
    res.status(500).json({
      message: "Failed to load opportunities."
    });
  }
});

/* =========================
   ADMIN: CREATE JOB
========================= */

router.post("/", async (req, res) => {
  try {
    const opportunity = await Opportunity.create(req.body);

    res.status(201).json({
      message: "Opportunity created successfully.",
      opportunity
    });
  } catch (err) {
    res.status(400).json({
      message: "Failed to create opportunity.",
      error: err.message
    });
  }
});

/* =========================
   ADMIN: UPDATE JOB
========================= */

router.put("/:id", async (req, res) => {
  try {
    const opportunity = await Opportunity.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!opportunity) {
      return res.status(404).json({
        message: "Opportunity not found."
      });
    }

    res.json({
      message: "Opportunity updated successfully.",
      opportunity
    });
  } catch (err) {
    res.status(400).json({
      message: "Failed to update opportunity.",
      error: err.message
    });
  }
});

/* =========================
   ADMIN: DELETE JOB
========================= */

router.delete("/:id", async (req, res) => {
  try {
    const opportunity = await Opportunity.findByIdAndDelete(req.params.id);

    if (!opportunity) {
      return res.status(404).json({
        message: "Opportunity not found."
      });
    }

    res.json({
      message: "Opportunity deleted successfully."
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to delete opportunity."
    });
  }
});

/* =========================
   PUBLIC: APPLY FOR JOB
========================= */

router.post(
  "/apply",
  upload.single("cv"),
  async (req, res) => {
    try {
      let cvUrl = "";
      let cvPublicId = "";

      if (req.file) {
        const uploaded = await uploadToCloudinary(
          req.file.buffer,
          "practice-online/opportunity-cvs",
          req.file.originalname
        );

        cvUrl = uploaded.secure_url;
        cvPublicId = uploaded.public_id;
      }

      const application = await OpportunityApplication.create({
        ...req.body,
        cvUrl,
        cvPublicId
      });

      res.status(201).json({
        message: "Application submitted successfully.",
        application
      });

    } catch (err) {
      res.status(500).json({
        message: "Failed to submit application.",
        error: err.message
      });
    }
  }
);

/* =========================
   ADMIN: VIEW APPLICATIONS
========================= */

router.get("/applications/all", async (req, res) => {
  try {
    const applications = await OpportunityApplication.find()
      .sort({ createdAt: -1 });

    res.json(applications);
  } catch (err) {
    res.status(500).json({
      message: "Failed to load applications."
    });
  }
});

export default router;
