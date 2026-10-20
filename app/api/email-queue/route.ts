
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import EmailDraft from "@/models/EmailDraft";
import EmailQueueItem from "@/models/EmailQueueItem";
import GmailAccount from "@/models/GmailAccount";
import MailerSettings from "@/models/MailerSettings";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      !("emailDraftId" in body) ||
      typeof body.emailDraftId !== "string" ||
      !mongoose.Types.ObjectId.isValid(body.emailDraftId)
    ) {
      return NextResponse.json(
        { error: "A valid emailDraftId is required." },
        { status: 400 }
      );
    }

    await connectDB();

    const draft = await EmailDraft.findById(body.emailDraftId).lean();

    if (!draft) {
      return NextResponse.json(
        { error: "Email draft not found." },
        { status: 404 }
      );
    }

    if (draft.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved email drafts can be queued." },
        { status: 409 }
      );
    }

    const existing = await EmailQueueItem.findOne({
      emailDraftId: draft._id,
    }).lean();

    if (existing) {
      return NextResponse.json(
        {
          error: "This email draft already has a queue item.",
          queueItem: existing,
        },
        { status: 409 }
      );
    }

    const settings = await MailerSettings.findOne({ key: "default" }).lean();

    if (!settings?.activeGmailAccountId) {
      return NextResponse.json(
        { error: "Select an active Gmail account first." },
        { status: 409 }
      );
    }

    const account = await GmailAccount.findOne({
      _id: settings.activeGmailAccountId,
      status: "connected",
    })
      .select("_id email scopes")
      .lean();

    if (!account) {
      return NextResponse.json(
        { error: "The active Gmail account is not connected." },
        { status: 409 }
      );
    }

    const requiredScopes = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ];

    if (!requiredScopes.every((scope) => account.scopes.includes(scope))) {
      return NextResponse.json(
        { error: "Reconnect Gmail with the required permissions before queueing emails." },
        { status: 409 }
      );
    }

    const queueItem = await EmailQueueItem.create({
      emailDraftId: draft._id,
      campaignDraftId: draft.campaignDraftId,
      contactId: draft.contactId,
      gmailAccountId: account._id,
      senderEmail: account.email,
      status: "queued",
      scheduledFor: new Date(),
      attempts: 0,
    });

    return NextResponse.json(
      {
        message: "Approved email draft added to the queue.",
        queueItem,
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        { error: "This email draft already has a queue item." },
        { status: 409 }
      );
    }

    console.error("Failed to queue email draft:", error);

    return NextResponse.json(
      { error: "Unable to queue email draft." },
      { status: 500 }
    );
  }
}
