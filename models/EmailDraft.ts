
import mongoose, { Schema, type Model } from "mongoose";

export type EmailDraftStatus =
  | "pending_review"
  | "approved"
  | "rejected";

export interface IEmailDraft {
  campaignDraftId: mongoose.Types.ObjectId;
  contactId: mongoose.Types.ObjectId;
  subject: string;
  body: string;
  status: EmailDraftStatus;
  modelName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailDraftSchema = new Schema<IEmailDraft>(
  {
    campaignDraftId: {
      type: Schema.Types.ObjectId,
      ref: "CampaignDraft",
      required: true,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 10000,
    },
    status: {
      type: String,
      enum: ["pending_review", "approved", "rejected"],
      default: "pending_review",
      required: true,
    },
    modelName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
  },
  {
    timestamps: true,
  }
);

EmailDraftSchema.index(
  { campaignDraftId: 1, contactId: 1 },
  { unique: true }
);

const EmailDraft: Model<IEmailDraft> =
  (mongoose.models.EmailDraft as Model<IEmailDraft>) ||
  mongoose.model<IEmailDraft>("EmailDraft", EmailDraftSchema);

export default EmailDraft;
