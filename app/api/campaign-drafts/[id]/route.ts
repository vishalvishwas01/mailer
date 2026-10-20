
import { NextResponse } from "next/server";
import mongoose from "mongoose";

import {connectDB} from "@/lib/mongodb";
import CampaignDraft from "@/models/CampaignDraft";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  { params }: RouteContext
) {
  try {
    await connectDB();

    const { id } = await params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { error: "Invalid campaign draft ID." },
        { status: 400 }
      );
    }

    const draft = await CampaignDraft.findById(id)
      .populate("resumeId", "originalName mimeType size")
      .populate("templateId", "name subject body")
      .lean();

    if (!draft) {
      return NextResponse.json(
        { error: "Campaign draft not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Get campaign draft failed:", error);

    return NextResponse.json(
      { error: "Unable to retrieve campaign draft." },
      { status: 500 }
    );
  }
}
