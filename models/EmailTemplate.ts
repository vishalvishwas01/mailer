
import mongoose, { Schema, type Model } from "mongoose";

export interface IEmailTemplate {
  name: string;
  subject: string;
  body: string;
  resumeLink?: string;
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
    resumeLink: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// During Next.js development, Mongoose keeps compiled models across hot
// reloads. Recompile this model if it predates the resumeLink field, otherwise
// strict mode silently drops resumeLink updates from template saves.
const cachedEmailTemplate = mongoose.models.EmailTemplate as Model<IEmailTemplate> | undefined;
if (cachedEmailTemplate && !cachedEmailTemplate.schema.path("resumeLink")) {
  mongoose.deleteModel("EmailTemplate");
}

const EmailTemplate: Model<IEmailTemplate> =
  (mongoose.models.EmailTemplate as Model<IEmailTemplate>) ||
  mongoose.model<IEmailTemplate>("EmailTemplate", EmailTemplateSchema);

export default EmailTemplate;
