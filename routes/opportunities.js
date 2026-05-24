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
    const opportunities = await Opportunity.find({ status: "Open" }).sort({
      createdAt: -1
    });

    res.json(opportunities);
  } catch (err) {
    res.status(500).json({
      message: "Failed to load opportunities.",
      error: err.message
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
      message: "Failed to delete opportunity.",
      error: err.message
    });
  }
});

/* =========================
   PUBLIC: APPLY FOR JOB
========================= */

router.post(
  "/apply",
  upload.fields([
    { name: "cv", maxCount: 1 },
    { name: "idDocument", maxCount: 1 },
    { name: "qualificationDocument", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      let cvUrl = "";
      let cvPublicId = "";

      let idDocumentUrl = "";
      let idDocumentPublicId = "";

      let qualificationDocumentUrl = "";
      let qualificationDocumentPublicId = "";

      if (req.files?.cv?.[0]) {
        const uploaded = await uploadToCloudinary(
          req.files.cv[0].buffer,
          "practice-online/opportunity-cvs",
          req.files.cv[0].originalname
        );

        cvUrl = uploaded.secure_url;
        cvPublicId = uploaded.public_id;
      }

      if (req.files?.idDocument?.[0]) {
        const uploaded = await uploadToCloudinary(
          req.files.idDocument[0].buffer,
          "practice-online/opportunity-id-documents",
          req.files.idDocument[0].originalname
        );

        idDocumentUrl = uploaded.secure_url;
        idDocumentPublicId = uploaded.public_id;
      }

      if (req.files?.qualificationDocument?.[0]) {
        const uploaded = await uploadToCloudinary(
          req.files.qualificationDocument[0].buffer,
          "practice-online/opportunity-qualifications",
          req.files.qualificationDocument[0].originalname
        );

        qualificationDocumentUrl = uploaded.secure_url;
        qualificationDocumentPublicId = uploaded.public_id;
      }

      const application = await OpportunityApplication.create({
        ...req.body,

        cvUrl,
        cvPublicId,

        idDocumentUrl,
        idDocumentPublicId,

        qualificationDocumentUrl,
        qualificationDocumentPublicId
      });

      res.status(201).json({
        message: "Application submitted successfully.",
        application
      });
    } catch (err) {
      console.error("APPLICATION SUBMIT ERROR:", err);

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
    const applications = await OpportunityApplication.find().sort({
      createdAt: -1
    });

    res.json(applications);
  } catch (err) {
    res.status(500).json({
      message: "Failed to load applications.",
      error: err.message
    });
  }
});

export default router;
