
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";

import { connectDB } from "@/lib/mongodb";
import EmailDraft from "@/models/EmailDraft";
import EmailSend from "@/models/EmailSend";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const reviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
}).strict();

export async function PATCH(
  request: Request,
  { params }: RouteContext
) {
  try {
    await connectDB();

    const { id } = await params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { error: "Invalid email draft ID." },
        { status: 400 }
      );
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 }
      );
    }

    const parsed = reviewSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Status must be approved or rejected." },
        { status: 400 }
      );
    }

    const draft = await EmailDraft.findOneAndUpdate(
      { _id: id, status: "pending_review" },
      { $set: { status: parsed.data.status } },
      { new: true, runValidators: true }
    ).lean();

    if (!draft) {
      const exists = await EmailDraft.exists({ _id: id });

      return NextResponse.json(
        {
          error: exists
            ? "This draft has already been reviewed."
            : "Email draft not found.",
        },
        { status: exists ? 409 : 404 }
      );
    }

    return NextResponse.json({
      message: `Email draft ${draft.status}.`,
      draft,
    });
  } catch {
    console.error("Review email draft failed.");

    return NextResponse.json(
      { error: "Unable to update email draft status." },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid email draft ID." },
        { status: 400 }
      );
    }

    await connectDB();

    const draft = await EmailDraft.findById(id).lean();

    if (!draft) {
      return NextResponse.json(
        { error: "Email draft not found." },
        { status: 404 }
      );
    }

    const send = await EmailSend.findOne({ emailDraftId: draft._id })
      .select(
        "senderEmail recipientEmail status gmailAccountId gmailMessageId gmailThreadId errorMessage attemptedAt sentAt"
      )
      .lean();

    return NextResponse.json({
      draft,
      send: send ?? null,
      sendStatus: send?.status ?? "not_sent",
    });
  } catch (error) {
    console.error("Failed to fetch email draft details:", error);

    return NextResponse.json(
      { error: "Unable to fetch email draft details." },
      { status: 500 }
    );
  }
}
