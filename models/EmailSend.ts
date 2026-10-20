import mongoose, { Schema, type Model } from "mongoose";

export type EmailSendStatus =
  | "sending"
  | "sent"
  | "failed"
  | "unknown";

export interface IEmailSend {
  campaignDraftId: mongoose.Types.ObjectId;
  emailDraftId: mongoose.Types.ObjectId;
  contactId: mongoose.Types.ObjectId;
  gmailAccountId: mongoose.Types.ObjectId;

  recipientEmail: string;
  senderEmail: string;

  status: EmailSendStatus;
  gmailMessageId?: string;
  gmailThreadId?: string;
  errorMessage?: string;

  attemptedAt: Date;
  sentAt?: Date;
  lastReplyCheckedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const EmailSendSchema = new Schema<IEmailSend>(
  {
    campaignDraftId: {
      type: Schema.Types.ObjectId,
      ref: "CampaignDraft",
      required: true,
    },
    emailDraftId: {
      type: Schema.Types.ObjectId,
      ref: "EmailDraft",
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
    recipientEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    senderEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: ["sending", "sent", "failed", "unknown"],
      default: "sending",
      required: true,
    },
    gmailMessageId: {
      type: String,
      trim: true,
    },
    gmailThreadId: {
      type: String,
      trim: true,
    },
    errorMessage: {
      type: String,
      maxlength: 1000,
    },
    attemptedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    sentAt: {
      type: Date,
    },
    lastReplyCheckedAt: {
      type: Date,
      index: true,
    },
  },
  { timestamps: true }
);

// A draft must not acquire multiple send records.
EmailSendSchema.index({ emailDraftId: 1 }, { unique: true });

// A campaign must not send twice to the same contact.
EmailSendSchema.index(
  { campaignDraftId: 1, contactId: 1 },
  { unique: true }
);

// Useful for dashboard history and status filters.
EmailSendSchema.index({ status: 1, attemptedAt: -1 });
EmailSendSchema.index({ gmailAccountId: 1, attemptedAt: -1 });

const EmailSend: Model<IEmailSend> =
  (mongoose.models.EmailSend as Model<IEmailSend>) ||
  mongoose.model<IEmailSend>("EmailSend", EmailSendSchema);

export default EmailSend;