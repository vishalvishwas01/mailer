
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import EmailQueueItem from "@/models/EmailQueueItem";

const allowedStatuses = [
  "queued",
  "processing",
  "sent",
  "failed",
  "unknown",
  "cancelled",
] as const;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const status = url.searchParams.get("status");
    const gmailAccountId = url.searchParams.get("gmailAccountId");

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return NextResponse.json(
        { error: "Page must be positive and limit must be between 1 and 100." },
        { status: 400 }
      );
    }

    if (
      status &&
      !allowedStatuses.includes(status as (typeof allowedStatuses)[number])
    ) {
      return NextResponse.json(
        { error: "Invalid queue status." },
        { status: 400 }
      );
    }

    if (
      gmailAccountId &&
      !mongoose.Types.ObjectId.isValid(gmailAccountId)
    ) {
      return NextResponse.json(
        { error: "Invalid Gmail account ID." },
        { status: 400 }
      );
    }

    await connectDB();

    const filter: Record<string, unknown> = {};

    if (status) filter.status = status;
    if (gmailAccountId) filter.gmailAccountId = gmailAccountId;

    const [items, total] = await Promise.all([
      EmailQueueItem.find(filter)
        .sort({ scheduledFor: 1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("emailDraftId", "subject status")
        .populate("campaignDraftId", "name")
        .populate("gmailAccountId", "email")
        .lean(),
      EmailQueueItem.countDocuments(filter),
    ]);

    return NextResponse.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to fetch email queue:", error);

    return NextResponse.json(
      { error: "Unable to fetch email queue." },
      { status: 500 }
    );
  }
}
