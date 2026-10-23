
import mongoose, { Schema, type Model } from "mongoose";

export interface IEmailTemplate {
  name: string;
  subject: string;
  body: string;
  attachment?: {
    originalName: string;
    mimeType: string;
    size: number;
    fileId: mongoose.Types.ObjectId;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

const EmailTemplateSchema = new Schema<IEmailTemplate>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
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
      maxlength: 20000,
    },
    attachment: {
      originalName: { type: String, trim: true, maxlength: 255 },
      mimeType: { type: String, enum: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
      size: { type: Number, min: 1, max: 5 * 1024 * 1024 },
      fileId: { type: Schema.Types.ObjectId },
    },
  },
  {
    timestamps: true,
  }
);

const EmailTemplate: Model<IEmailTemplate> =
  (mongoose.models.EmailTemplate as Model<IEmailTemplate>) ||
  mongoose.model<IEmailTemplate>(
    "EmailTemplate",
    EmailTemplateSchema
  );

export default EmailTemplate;
