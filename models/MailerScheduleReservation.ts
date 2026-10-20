import mongoose, { Schema, type Model } from "mongoose";

export interface IMailerScheduleReservation {
  queueItemId: mongoose.Types.ObjectId;
  localDate: string;
  reservedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MailerScheduleReservationSchema =
  new Schema<IMailerScheduleReservation>(
    {
      queueItemId: {
        type: Schema.Types.ObjectId,
        ref: "EmailQueueItem",
        required: true,
        unique: true,
      },
      localDate: {
        type: String,
        required: true,
        index: true,
      },
      reservedAt: {
        type: Date,
        required: true,
      },
    },
    { timestamps: true }
  );

const MailerScheduleReservation: Model<IMailerScheduleReservation> =
  mongoose.models.MailerScheduleReservation ||
  mongoose.model<IMailerScheduleReservation>(
    "MailerScheduleReservation",
    MailerScheduleReservationSchema
  );

export default MailerScheduleReservation;
