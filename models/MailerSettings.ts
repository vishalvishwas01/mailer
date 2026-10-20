import mongoose, { Schema, type Model } from "mongoose";

export interface IMailerSettings {
  key: string;
  activeGmailAccountId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const MailerSettingsSchema = new Schema<IMailerSettings>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default",
    },
    activeGmailAccountId: {
      type: Schema.Types.ObjectId,
      ref: "GmailAccount",
      default: null,
    },
  },
  { timestamps: true }
);

const MailerSettings: Model<IMailerSettings> =
  (mongoose.models.MailerSettings as Model<IMailerSettings>) ||
  mongoose.model<IMailerSettings>(
    "MailerSettings",
    MailerSettingsSchema
  );

export default MailerSettings;