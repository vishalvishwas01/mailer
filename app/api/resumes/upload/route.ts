
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { basename, extname } from "node:path";
import * as yauzl from "yauzl";
import Resume from "@/models/Resume";
import {
  saveResumeFile,
  deleteResumeFile,
} from "@/lib/gridfs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 5 &&
    buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function isDocx(buffer: Buffer): Promise<boolean> {
  return new Promise((resolve) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true },
      (error, zipFile) => {
        if (error || !zipFile) {
          resolve(false);
          return;
        }

        let settled = false;
        const found = new Set<string>();

        const finish = (valid: boolean) => {
          if (settled) return;
          settled = true;
          zipFile.close();
          resolve(valid);
        };

        zipFile.on("error", () => finish(false));

        zipFile.on("entry", (entry) => {
          found.add(entry.fileName);

          if (
            found.has("[Content_Types].xml") &&
            found.has("word/document.xml")
          ) {
            finish(true);
            return;
          }

          zipFile.readEntry();
        });

        zipFile.on("end", () => finish(false));

        zipFile.readEntry();
      }
    );
  });
}

export async function POST(request: Request) {
  let savedFileId: mongoose.Types.ObjectId | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("resume");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing file. Use the field name "resume".' },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "The uploaded file is empty." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Resume must not exceed 5 MB." },
        { status: 413 }
      );
    }

    const filename = basename(file.name);
    const extension = extname(filename).toLowerCase();

    if (extension !== ".pdf" && extension !== ".docx") {
      return NextResponse.json(
        { error: "Only PDF and DOCX files are supported." },
        { status: 415 }
      );
    }

    if (file.type && (
      (extension === ".pdf" && file.type !== PDF_MIME) ||
      (extension === ".docx" && file.type !== DOCX_MIME)
    )) {
      return NextResponse.json(
        { error: "File extension and MIME type do not match." },
        { status: 415 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (buffer.length !== file.size || buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Invalid file size." },
        { status: 400 }
      );
    }

    let mimeType: typeof PDF_MIME | typeof DOCX_MIME;

    if (extension === ".pdf") {
      if (!isPdf(buffer)) {
        return NextResponse.json(
          { error: "The file is not a valid PDF." },
          { status: 415 }
        );
      }

      mimeType = PDF_MIME;
    } else {
      if (
        buffer.length < 4 ||
        buffer[0] !== 0x50 ||
        buffer[1] !== 0x4b ||
        !(await isDocx(buffer))
      ) {
        return NextResponse.json(
          { error: "The file is not a valid DOCX document." },
          { status: 415 }
        );
      }

      mimeType = DOCX_MIME;
    }

    const fileId = await saveResumeFile(
      buffer,
      filename,
      mimeType
    );

    savedFileId = fileId as mongoose.Types.ObjectId;

    const resume = await Resume.create({
      originalName: filename,
      mimeType,
      size: buffer.length,
      fileId,
    });

    return NextResponse.json(
      {
        message: "Resume uploaded successfully.",
        resume: {
          id: resume._id.toString(),
          originalName: resume.originalName,
          mimeType: resume.mimeType,
          size: resume.size,
          createdAt: resume.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (savedFileId) {
      try {
        await deleteResumeFile(savedFileId);
      } catch (cleanupError) {
        console.error(
          "Failed to clean up an unreferenced resume file:",
          cleanupError
        );
      }
    }

    console.error("Resume upload failed:", error);

    return NextResponse.json(
      { error: "Resume upload failed. Check the server logs." },
      { status: 500 }
    );
  }
}
