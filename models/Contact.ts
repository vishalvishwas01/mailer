
import mongoose, { Schema, model, models } from "mongoose";

export interface IContact {
  email: string;
  name?: string;
  company?: string;
  website?: string;
  sourceFile?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema = new Schema<IContact>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    company: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    website: {
      type: String,
      trim: true,
      maxlength: 2048,
    },
    sourceFile: {
      type: String,
      trim: true,
      maxlength: 255,
    },
  },
  {
    timestamps: true,
  }
);

ContactSchema.index({ email: 1 }, { unique: true });

const Contact =
  (models.Contact as mongoose.Model<IContact>) ||
  model<IContact>("Contact", ContactSchema);

export default Contact;
