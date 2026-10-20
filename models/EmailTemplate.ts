
import mongoose, { Schema, type Model } from "mongoose";

export interface IEmailTemplate {
  name: string;
  subject: string;
  body: string;
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
