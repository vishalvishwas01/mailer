import mongoose, { Schema, type Model } from "mongoose";

export interface ILoginAttempt {
  ipHash: string;
  attemptedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LoginAttemptSchema = new Schema<ILoginAttempt>({
  ipHash: { type: String, required: true, index: true },
  attemptedAt: { type: Date, required: true, default: Date.now, expires: 86400 },
}, { timestamps: true });

LoginAttemptSchema.index({ ipHash: 1, attemptedAt: -1 });

const LoginAttempt: Model<ILoginAttempt> =
  mongoose.models.LoginAttempt || mongoose.model<ILoginAttempt>("LoginAttempt", LoginAttemptSchema);

export default LoginAttempt;
