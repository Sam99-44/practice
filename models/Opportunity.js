import mongoose from "mongoose";

const OpportunitySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },

    category: {
      type: String,
      required: true,
      trim: true
    },

    location: {
      type: String,
      default: "Online"
    },

    type: {
      type: String,
      default: "Part-time"
    },

    description: {
      type: String,
      required: true
    },

    requirements: {
      type: String,
      default: ""
    },

    closingDate: {
      type: Date
    },

    status: {
      type: String,
      enum: ["Open", "Closed"],
      default: "Open"
    }
  },
  { timestamps: true }
);

export default mongoose.model("Opportunity", OpportunitySchema);
