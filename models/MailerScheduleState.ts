
import mongoose, { Schema, type Model } from "mongoose";

export interface IMailerScheduleState {
  key: string;
  localDate: string;
  dailyCount: number;
  lastReservedAt?: Date;
  lastQueueItemId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MailerScheduleStateSchema = new Schema<IMailerScheduleState>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default",
    },
    localDate: {
      type: String,
      required: true,
      default: "",
    },
    dailyCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lastReservedAt: {
      type: Date,
    },
    lastQueueItemId: {
      type: Schema.Types.ObjectId,
      ref: "EmailQueueItem",
    },
  },
  {
    timestamps: true,
  }
);

const MailerScheduleState: Model<IMailerScheduleState> =
  mongoose.models.MailerScheduleState ||
  mongoose.model<IMailerScheduleState>(
    "MailerScheduleState",
    MailerScheduleStateSchema
  );

export default MailerScheduleState;
