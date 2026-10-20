import mongoose, { Schema, type Model } from "mongoose";

export interface IGmailAccount {
  email: string;
  googleId: string;
  accessTokenEncrypted?: string;
  refreshTokenEncrypted: string;
  accessTokenExpiresAt?: Date;
  scopes: string[];
  status: "connected" | "disconnected";
  connectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GmailAccountSchema = new Schema<IGmailAccount>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    googleId: {
      type: String,
      required: true,
      trim: true,
    },
    accessTokenEncrypted: {
      type: String,
      select: false,
    },
    refreshTokenEncrypted: {
      type: String,
      required: true,
      select: false,
    },
    accessTokenExpiresAt: {
      type: Date,
    },
    scopes: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["connected", "disconnected"],
      default: "connected",
      required: true,
    },
    connectedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true }
);

GmailAccountSchema.index({ email: 1 }, { unique: true });
GmailAccountSchema.index({ googleId: 1 });

const GmailAccount: Model<IGmailAccount> =
  (mongoose.models.GmailAccount as Model<IGmailAccount>) ||
  mongoose.model<IGmailAccount>("GmailAccount", GmailAccountSchema);

export default GmailAccount;