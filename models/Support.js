import mongoose from "mongoose";

const SupportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    username: { type: String, default: "" },
    email: { type: String, default: "" },
    grade: { type: Number, default: null },

    subject: { type: String, default: "Maths" },
    requestType: { type: String, required: true },

    topics: { type: [String], default: [] },
    message: { type: String, default: "" },

    wantExtraClasses: { type: Boolean, default: false },
    preferredService: { type: String, default: "" },
    contact: { type: String, default: "" },

    changeAccount: {
      currentAccountType: { type: String, default: "" },
      newAccountType: { type: String, default: "" },
      newGrade: { type: Number, default: null },
      contact: { type: String, default: "" },
    },

    status: { type: String, default: "open" }, // open | in_progress | resolved
  },
  { timestamps: true }
);

export default mongoose.model("Support", SupportSchema);
