
import mongoose, { Schema, type Model } from "mongoose";

export type EmailQueueStatus =
  | "queued"
  | "processing"
  | "sent"
  | "failed"
  | "unknown"
  | "cancelled";

export interface IEmailQueueItem {
  emailDraftId: mongoose.Types.ObjectId;
  campaignDraftId: mongoose.Types.ObjectId;
  contactId: mongoose.Types.ObjectId;
  gmailAccountId: mongoose.Types.ObjectId;
  senderEmail: string;
  status: EmailQueueStatus;
  scheduledFor: Date;
  claimedAt?: Date;
  lockedUntil?: Date;
  attempts: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailQueueItemSchema = new Schema<IEmailQueueItem>(
  {
    emailDraftId: {
      type: Schema.Types.ObjectId,
      ref: "EmailDraft",
      required: true,
      unique: true,
    },
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
    gmailAccountId: {
      type: Schema.Types.ObjectId,
      ref: "GmailAccount",
      required: true,
    },
    senderEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["queued", "processing", "sent", "failed", "unknown", "cancelled"],
      default: "queued",
      required: true,
      index: true,
    },
    scheduledFor: {
      type: Date,
      required: true,
      index: true,
    },
    claimedAt: {
      type: Date,
    },
    lockedUntil: {
      type: Date,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastError: {
      type: String,
      maxlength: 2000,
    },
  },
  {
    timestamps: true,
  }
);

EmailQueueItemSchema.index({
  status: 1,
  scheduledFor: 1,
});

EmailQueueItemSchema.index({
  status: 1,
  lockedUntil: 1,
});

const EmailQueueItem: Model<IEmailQueueItem> =
  mongoose.models.EmailQueueItem ||
  mongoose.model<IEmailQueueItem>("EmailQueueItem", EmailQueueItemSchema);

export default EmailQueueItem;
