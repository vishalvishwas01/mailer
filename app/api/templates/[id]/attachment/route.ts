import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { basename, extname } from "node:path";
import * as yauzl from "yauzl";
import EmailTemplate from "@/models/EmailTemplate";
import { connectDB } from "@/lib/mongodb";
import { deleteResumeFile, saveResumeFile } from "@/lib/gridfs";

const MAX_SIZE = 5 * 1024 * 1024;
const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
type Context = { params: Promise<{ id: string }> };

function isDocx(buffer: Buffer): Promise<boolean> {
  return new Promise((resolve) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return resolve(false);
      const entries = new Set<string>();
      let settled = false;
      const finish = (valid: boolean) => {
        if (settled) return;
        settled = true;
        zip.close();
        resolve(valid);
      };
      zip.on("error", () => finish(false));
      zip.on("entry", (entry) => {
        entries.add(entry.fileName);
        if (entries.has("[Content_Types].xml") && entries.has("word/document.xml")) return finish(true);
        zip.readEntry();
      });
      zip.on("end", () => finish(false));
      zip.readEntry();
    });
  });
}

export async function POST(request: Request, { params }: Context) {
  let saved: mongoose.Types.ObjectId | null = null;
  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid template ID." }, { status: 400 });
    const form = await request.formData();
    const file = form.get("attachment");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PDF or DOCX file." }, { status: 400 });
    const name = basename(file.name);
    const ext = extname(name).toLowerCase();
    if (!file.size || file.size > MAX_SIZE || (ext !== ".pdf" && ext !== ".docx")) return NextResponse.json({ error: "Attachment must be a PDF or DOCX file no larger than 5 MB." }, { status: 415 });
    if (file.type && file.type !== (ext === ".pdf" ? PDF : DOCX)) return NextResponse.json({ error: "File extension and MIME type do not match." }, { status: 415 });
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length !== file.size || buffer.length > MAX_SIZE) return NextResponse.json({ error: "Invalid attachment size." }, { status: 400 });
    const mimeType = ext === ".pdf" ? PDF : DOCX;
    const valid = ext === ".pdf" ? buffer.subarray(0, 5).toString("ascii") === "%PDF-" : buffer.subarray(0, 2).toString("ascii") === "PK" && await isDocx(buffer);
    if (!valid) return NextResponse.json({ error: "The uploaded file is not a valid PDF or DOCX." }, { status: 415 });
    await connectDB();
    const template = await EmailTemplate.findById(id);
    if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    const fileId = await saveResumeFile(buffer, name, mimeType, "template-attachment");
    saved = fileId as mongoose.Types.ObjectId;
    const previous = template.attachment?.fileId;
    template.attachment = { originalName: name, mimeType, size: buffer.length, fileId: saved };
    await template.save();
    if (previous) await deleteResumeFile(previous).catch(() => undefined);
    return NextResponse.json({ attachment: template.attachment });
  } catch (error) {
    if (saved) await deleteResumeFile(saved).catch(() => undefined);
    console.error("Template attachment upload failed:", error);
    return NextResponse.json({ error: "Could not upload template attachment." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid template ID." }, { status: 400 });
    await connectDB();
    const template = await EmailTemplate.findById(id);
    if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    const previous = template.attachment?.fileId;
    template.attachment = null;
    await template.save();
    if (previous) await deleteResumeFile(previous).catch(() => undefined);
    return NextResponse.json({ attachment: null });
  } catch { return NextResponse.json({ error: "Could not remove template attachment." }, { status: 500 }); }
}
