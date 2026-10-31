
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

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "A valid emailDraftId or emailDraftIds array is required." },
        { status: 400 }
      );
    }

    const isBatch = "emailDraftIds" in body;
    const rawIds = isBatch
      ? body.emailDraftIds
      : "emailDraftId" in body
        ? [body.emailDraftId]
        : null;
    if (
      !Array.isArray(rawIds) ||
      rawIds.length < 1 ||
      rawIds.length > 100 ||
      rawIds.some((id) => typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id))
    ) {
      return NextResponse.json(
        { error: "Provide between 1 and 100 valid email draft IDs." },
        { status: 400 }
      );
    }
    const draftIds = [...new Set(rawIds as string[])];

    await connectDB();

    const drafts = await EmailDraft.find({ _id: { $in: draftIds } }).lean();
    const draftById = new Map(drafts.map((draft) => [draft._id.toString(), draft]));
    if (!isBatch) {
      const draft = draftById.get(draftIds[0]);
      if (!draft) return NextResponse.json({ error: "Email draft not found." }, { status: 404 });
      if (draft.status !== "approved") return NextResponse.json({ error: "Only approved email drafts can be queued." }, { status: 409 });
    }

    const existingItems = await EmailQueueItem.find({ emailDraftId: { $in: draftIds } }).lean();
    const existingByDraftId = new Map(existingItems.map((item) => [item.emailDraftId.toString(), item]));
    if (!isBatch && existingByDraftId.has(draftIds[0])) {
      return NextResponse.json(
        { error: "This email draft already has a queue item.", queueItem: existingByDraftId.get(draftIds[0]) },
        { status: 409 }
      );
    }

    const approvedToQueue = drafts.filter(
      (draft) => draft.status === "approved" && !existingByDraftId.has(draft._id.toString())
    );
    if (!isBatch && approvedToQueue.length === 0) {
      return NextResponse.json({ error: "Only approved email drafts can be queued." }, { status: 409 });
    }
    if (isBatch && approvedToQueue.length === 0) {
      return NextResponse.json({
        queuedCount: 0,
        results: draftIds.map((id) => ({
          emailDraftId: id,
          status: existingByDraftId.has(id) ? "already_queued" : "skipped",
          reason: existingByDraftId.has(id) ? "A queue item already exists." : draftById.has(id) ? "Draft is not approved." : "Draft not found.",
        })),
      });
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

    const createdItems = await Promise.all(approvedToQueue.map(async (draft) => {
      try {
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
        return { emailDraftId: draft._id.toString(), status: "queued" as const, queueItem };
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === 11000) {
          return { emailDraftId: draft._id.toString(), status: "already_queued" as const };
        }
        return { emailDraftId: draft._id.toString(), status: "failed" as const };
      }
    }));

    if (isBatch) {
      const resultById = new Map<string, { emailDraftId: string; status: string; reason?: string }>();
      for (const id of draftIds) {
        if (existingByDraftId.has(id)) {
          resultById.set(id, { emailDraftId: id, status: "already_queued", reason: "A queue item already exists." });
        } else if (!draftById.has(id)) {
          resultById.set(id, { emailDraftId: id, status: "skipped", reason: "Draft not found." });
        } else if (draftById.get(id)?.status !== "approved") {
          resultById.set(id, { emailDraftId: id, status: "skipped", reason: "Draft is not approved." });
        }
      }
      for (const item of createdItems) {
        resultById.set(item.emailDraftId, {
          emailDraftId: item.emailDraftId,
          status: item.status,
          reason: item.status === "failed" ? "Unable to create queue item." : undefined,
        });
      }
      const results = draftIds.map((id) => resultById.get(id)!);
      return NextResponse.json({
        queuedCount: results.filter((item) => item.status === "queued").length,
        results,
      });
    }

    const created = createdItems[0];
    if (!created || created.status !== "queued") {
      return NextResponse.json({ error: "Unable to queue email draft." }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: "Approved email draft added to the queue.",
        queueItem: created.queueItem,
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
