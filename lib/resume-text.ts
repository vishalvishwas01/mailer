
import "server-only";
import mongoose from "mongoose";
import pdf from "pdf-parse";
import mammoth from "mammoth";

import Resume from "@/models/Resume";
import { getResumeBucket } from "@/lib/gridfs";

const MAX_RESUME_SIZE = 5 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 12_000;

export async function extractResumeText(
  resumeId: string | mongoose.Types.ObjectId
): Promise<{ originalName: string; text: string }> {
  if (!mongoose.isValidObjectId(resumeId)) {
    throw new Error("Invalid resume ID.");
  }

  const resume = await Resume.findById(resumeId).lean();

  if (!resume) {
    throw new Error("Resume not found.");
  }

  const bucket = await getResumeBucket();
  const fileId = new mongoose.Types.ObjectId(
    resume.fileId.toString()
  );

  const chunks: Buffer[] = [];
  let totalSize = 0;

  for await (const chunk of bucket.openDownloadStream(fileId)) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);

    totalSize += buffer.length;

    if (totalSize > MAX_RESUME_SIZE) {
      throw new Error("Resume exceeds the maximum allowed size.");
    }

    chunks.push(buffer);
  }

  const buffer = Buffer.concat(chunks);

  if (buffer.length === 0) {
    throw new Error("The uploaded resume file is empty.");
  }

  let extractedText: string;

  if (resume.mimeType === "application/pdf") {
    const result = await pdf(buffer);
    extractedText = result.text;
  } else if (
    resume.mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    extractedText = result.value;
  } else {
    throw new Error("Unsupported resume file type.");
  }

  const text = extractedText
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);

  if (!text) {
    throw new Error(
      "No readable text was found in the resume."
    );
  }

  return {
    originalName: resume.originalName,
    text,
  };
}
