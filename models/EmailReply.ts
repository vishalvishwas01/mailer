import mongoose, { Schema, type Model } from "mongoose";

export interface IEmailReply {
  emailSendId: mongoose.Types.ObjectId;
  gmailAccountId: mongoose.Types.ObjectId;
  contactId: mongoose.Types.ObjectId;
  gmailThreadId: string;
  gmailMessageId: string;
  fromEmail: string;
  toEmail?: string;
  subject?: string;
  snippet: string;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EmailReplySchema = new Schema<IEmailReply>({
  emailSendId: { type: Schema.Types.ObjectId, ref: "EmailSend", required: true, index: true },
  gmailAccountId: { type: Schema.Types.ObjectId, ref: "GmailAccount", required: true, index: true },
  contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
  gmailThreadId: { type: String, required: true, trim: true, index: true },
  gmailMessageId: { type: String, required: true, trim: true, unique: true },
  fromEmail: { type: String, required: true, trim: true, lowercase: true },
  toEmail: { type: String, trim: true, lowercase: true },
  subject: { type: String, trim: true, maxlength: 500 },
  snippet: { type: String, maxlength: 2000, default: "" },
  receivedAt: { type: Date, required: true, index: true },
}, { timestamps: true });

EmailReplySchema.index({ contactId: 1, receivedAt: -1 });

const EmailReply: Model<IEmailReply> =
  mongoose.models.EmailReply || mongoose.model<IEmailReply>("EmailReply", EmailReplySchema);

export default EmailReply;
