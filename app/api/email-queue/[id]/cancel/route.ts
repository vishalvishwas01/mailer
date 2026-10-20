
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import EmailQueueItem from "@/models/EmailQueueItem";

export async function POST(
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

    const item = await EmailQueueItem.findOneAndUpdate(
      {
        _id: id,
        status: "queued",
      },
      {
        $set: {
          status: "cancelled",
        },
        $unset: {
          lockedUntil: 1,
        },
      },
      { new: true }
    ).lean();

    if (!item) {
      const existing = await EmailQueueItem.findById(id)
        .select("status")
        .lean();

      if (!existing) {
        return NextResponse.json(
          { error: "Queue item not found." },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          error: `Cannot cancel an item with status "${existing.status}". Only queued items can be cancelled.`,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      message: "Queued email cancelled.",
      item,
    });
  } catch (error) {
    console.error("Failed to cancel queued email:", error);

    return NextResponse.json(
      { error: "Unable to cancel queued email." },
      { status: 500 }
    );
  }
}
