import mongoose from "mongoose";

const OpportunityApplicationSchema = new mongoose.Schema(
  {
    opportunityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Opportunity"
    },

    opportunityTitle: {
      type: String,
      required: true
    },

    fullName: {
      type: String,
      required: true
    },

    idNumber: String,
    email: {
      type: String,
      required: true
    },

    phone: {
      type: String,
      required: true
    },

    province: String,
    city: String,
    address: String,
    postalCode: String,

    qualification: String,
    fieldOfStudy: String,
    institution: String,
    completionYear: String,

    currentOccupation: String,
    experienceYears: String,
    employmentHistory: String,

    technicalSkills: String,
    professionalSummary: String,
    availability: String,

    portfolio: String,

    cvUrl: String,
    cvPublicId: String,

    status: {
      type: String,
      enum: ["Submitted", "Reviewed", "Shortlisted", "Rejected"],
      default: "Submitted"
    }
  },
  { timestamps: true }
);

export default mongoose.model("OpportunityApplication", OpportunityApplicationSchema);
