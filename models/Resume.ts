
import mongoose, { Schema, type Model } from "mongoose";

export interface IResume {
  originalName: string;
  mimeType: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  size: number;
  fileId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ResumeSchema = new Schema<IResume>(
  {
    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    mimeType: {
      type: String,
      required: true,
      enum: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
    },
    size: {
      type: Number,
      required: true,
      min: 1,
      max: 5 * 1024 * 1024,
    },
    fileId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

const Resume: Model<IResume> =
  (mongoose.models.Resume as Model<IResume>) ||
  mongoose.model<IResume>("Resume", ResumeSchema);

export default Resume;
