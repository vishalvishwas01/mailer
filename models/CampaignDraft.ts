
import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface ICampaignDraft extends Document {
  name: string;
  resumeId: mongoose.Types.ObjectId;
  templateId: mongoose.Types.ObjectId;
  status: "draft";
  createdAt: Date;
  updatedAt: Date;
}

const CampaignDraftSchema = new Schema<ICampaignDraft>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    resumeId: {
      type: Schema.Types.ObjectId,
      ref: "Resume",
      required: true,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: "EmailTemplate",
      required: true,
    },
    status: {
      type: String,
      enum: ["draft"],
      default: "draft",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const CampaignDraft: Model<ICampaignDraft> =
  (mongoose.models.CampaignDraft as Model<ICampaignDraft>) ||
  mongoose.model<ICampaignDraft>(
    "CampaignDraft",
    CampaignDraftSchema
  );

export default CampaignDraft;

