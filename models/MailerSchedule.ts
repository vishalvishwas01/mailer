import mongoose, { Schema, type Model } from "mongoose";

export interface IMailerSchedule {
  key: string;
  enabled: boolean;
  timezone: string;
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  dailyLimit: number;
  createdAt: Date;
  updatedAt: Date;
}

const MailerScheduleSchema = new Schema<IMailerSchedule>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default",
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    timezone: {
      type: String,
      required: true,
      default: "Asia/Kolkata",
    },
    startTime: {
      type: String,
      required: true,
      default: "23:00",
    },
    endTime: {
      type: String,
      required: true,
      default: "01:00",
    },
    intervalMinutes: {
      type: Number,
      required: true,
      default: 30,
      min: 5,
      max: 1440,
    },
    dailyLimit: {
      type: Number,
      required: true,
      default: 4,
      min: 1,
      max: 500,
    },
  },
  {
    timestamps: true,
  }
);

const MailerSchedule: Model<IMailerSchedule> =
  mongoose.models.MailerSchedule ||
  mongoose.model<IMailerSchedule>("MailerSchedule", MailerScheduleSchema);

export default MailerSchedule;