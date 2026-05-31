// models/TutorDocument.js
import mongoose from "mongoose";

const TutorDocumentSchema = new mongoose.Schema(
  {
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    subject: { type: String, required: true, trim: true, maxlength: 120, index: true },
    grade: { type: Number, required: true, min: 8, max: 12, index: true },
    documentType: {
      type: String,
      enum: ["homework","notes","worksheet","memo","assignment","other"],
      default: "homework",
      index: true,
    },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, required: true, trim: true },
    fileUrl: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    sizeBytes: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

TutorDocumentSchema.index({ grade: 1, subject: 1, documentType: 1 });
TutorDocumentSchema.index({ createdAt: -1 });

const TutorDocument =
  mongoose.models.TutorDocument || mongoose.model("TutorDocument", TutorDocumentSchema);

export default TutorDocument;
