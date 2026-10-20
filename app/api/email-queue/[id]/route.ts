
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import EmailQueueItem from "@/models/EmailQueueItem";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid queue item ID." },
        { status: 400 }
      );
    }

    await connectDB();

    const item = await EmailQueueItem.findById(id)
      .populate("emailDraftId", "subject status")
      .populate("campaignDraftId", "name")
      .populate("gmailAccountId", "email")
      .lean();

    if (!item) {
      return NextResponse.json(
        { error: "Queue item not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Failed to fetch queue item:", error);

    return NextResponse.json(
      { error: "Unable to fetch queue item." },
      { status: 500 }
    );
  }
}
