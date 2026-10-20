
import mongoose from "mongoose";
import { GridFSBucket, type ObjectId } from "mongodb";
import { Readable } from "node:stream";

const BUCKET_NAME = "resumes";

async function ensureDatabaseConnection() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri);
  }

  const db = mongoose.connection.db;

  if (!db) {
    throw new Error("MongoDB connection is unavailable.");
  }

  return db;
}

export async function getResumeBucket() {
  const db = await ensureDatabaseConnection();

  return new GridFSBucket(db, {
    bucketName: BUCKET_NAME,
  });
}

export async function saveResumeFile(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<ObjectId> {
  const bucket = await getResumeBucket();

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      contentType,
      metadata: {
        purpose: "resume",
      },
    });

    uploadStream.once("error", reject);
    uploadStream.once("finish", () => {
      resolve(uploadStream.id as ObjectId);
    });

    Readable.from([buffer]).pipe(uploadStream);
  });
}

export async function deleteResumeFile(fileId: ObjectId) {
  const bucket = await getResumeBucket();
  await bucket.delete(fileId);
}
