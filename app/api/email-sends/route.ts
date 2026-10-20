import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import EmailSend from "@/models/EmailSend";

const ALLOWED_STATUSES = ["sending", "sent", "failed", "unknown"];

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);

    const page = Math.max(
      1,
      Number.parseInt(searchParams.get("page") ?? "1", 10) || 1
    );

    const requestedLimit = Number.parseInt(
      searchParams.get("limit") ?? "20",
      10
    );

    const limit = Math.min(
      100,
      Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 20)
    );

    const status = searchParams.get("status");
    const gmailAccountId = searchParams.get("gmailAccountId");
    const campaignDraftId = searchParams.get("campaignDraftId");

    const filter: Record<string, unknown> = {};

    if (status) {
      if (!ALLOWED_STATUSES.includes(status)) {
        return NextResponse.json(
          {
            error: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(", ")}.`,
          },
          { status: 400 }
        );
      }

      filter.status = status;
    }

    if (gmailAccountId) {
      if (!mongoose.Types.ObjectId.isValid(gmailAccountId)) {
        return NextResponse.json(
          { error: "Invalid Gmail account ID." },
          { status: 400 }
        );
      }

      filter.gmailAccountId = new mongoose.Types.ObjectId(gmailAccountId);
    }

    if (campaignDraftId) {
      if (!mongoose.Types.ObjectId.isValid(campaignDraftId)) {
        return NextResponse.json(
          { error: "Invalid campaign draft ID." },
          { status: 400 }
        );
      }

      filter.campaignDraftId = new mongoose.Types.ObjectId(campaignDraftId);
    }

    const [sends, total] = await Promise.all([
      EmailSend.find(filter)
        .select(
          "campaignDraftId emailDraftId contactId gmailAccountId recipientEmail senderEmail status gmailMessageId gmailThreadId errorMessage attemptedAt sentAt createdAt updatedAt"
        )
        .sort({ attemptedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      EmailSend.countDocuments(filter),
    ]);

    return NextResponse.json({
      sends,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to fetch email send history:", error);

    return NextResponse.json(
      { error: "Unable to fetch email send history." },
      { status: 500 }
    );
  }
}