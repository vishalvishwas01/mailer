
import mongoose, { Schema, type Model } from "mongoose";

export interface IMailerWorkerLock {
  key: string;
  owner: string;
  lockedUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MailerWorkerLockSchema = new Schema<IMailerWorkerLock>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "email-scheduler",
    },
    owner: {
      type: String,
      required: true,
    },
    lockedUntil: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const MailerWorkerLock: Model<IMailerWorkerLock> =
  mongoose.models.MailerWorkerLock ||
  mongoose.model<IMailerWorkerLock>(
    "MailerWorkerLock",
    MailerWorkerLockSchema
  );

export default MailerWorkerLock;
