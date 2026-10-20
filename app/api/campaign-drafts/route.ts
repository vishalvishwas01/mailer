
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";

import {connectDB} from "@/lib/mongodb";
import CampaignDraft from "@/models/CampaignDraft";
import Resume from "@/models/Resume";
import EmailTemplate from "@/models/EmailTemplate";

const createDraftSchema = z.object({
  name: z.string().trim().min(1).max(100),
  resumeId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid resume ID"),
  templateId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid template ID"),
}).strict();



export async function GET() {
  try {
    await connectDB();

    const drafts = await CampaignDraft.find()
      .populate("resumeId", "originalName mimeType size")
      .populate("templateId", "name subject body")
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({ drafts });
  } catch (error) {
    console.error("List campaign drafts failed:", error);

    return NextResponse.json(
      { error: "Unable to retrieve campaign drafts." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await connectDB();

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 }
      );
    }

    const parsed = createDraftSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid campaign draft data.",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { name, resumeId, templateId } = parsed.data;

    const [resume, template] = await Promise.all([
      Resume.findById(resumeId).select("_id"),
      EmailTemplate.findById(templateId).select("_id"),
    ]);

    if (!resume) {
      return NextResponse.json(
        { error: "The selected resume was not found." },
        { status: 404 }
      );
    }

    if (!template) {
      return NextResponse.json(
        { error: "The selected email template was not found." },
        { status: 404 }
      );
    }

    const draft = await CampaignDraft.create({
      name,
      resumeId: new mongoose.Types.ObjectId(resumeId),
      templateId: new mongoose.Types.ObjectId(templateId),
      status: "draft",
    });

    const populatedDraft = await CampaignDraft.findById(draft._id)
      .populate("resumeId", "originalName mimeType size")
      .populate("templateId", "name subject body")
      .lean();

    return NextResponse.json(
      {
        message: "Campaign draft created successfully.",
        draft: populatedDraft,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create campaign draft failed:", error);

    return NextResponse.json(
      { error: "Unable to create campaign draft." },
      { status: 500 }
    );
  }
}
