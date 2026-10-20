import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getAuthenticatedGmailClientForAccount } from "@/lib/gmail-client";
import EmailSend from "@/models/EmailSend";
import EmailReply from "@/models/EmailReply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(secret ? `Bearer ${secret}` : "");
  return Boolean(secret && secret.length >= 32 && supplied.length === expected.length && timingSafeEqual(supplied, expected));
}

function headerValue(headers: Array<{ name?: string | null; value?: string | null }> | undefined, name: string) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractEmail(value: string) {
  const match = value.match(/<([^<>\s]+@[^<>\s]+)>/) || value.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  return match?.[1]?.trim().toLowerCase() ?? "";
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized reply poll request." }, { status: 401 });
  }

  try {
    await connectDB();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recheckBefore = new Date(Date.now() - 14 * 60 * 1000);
    const sends = await EmailSend.find({
      status: "sent",
      gmailThreadId: { $exists: true, $ne: "" },
      sentAt: { $gte: since },
      $or: [
        { lastReplyCheckedAt: { $exists: false } },
        { lastReplyCheckedAt: { $lt: recheckBefore } },
      ],
    }).sort({ lastReplyCheckedAt: 1, sentAt: -1 }).limit(100).lean();

    let checkedThreads = 0;
    let savedReplies = 0;
    let skippedThreads = 0;

    for (const send of sends) {
      try {
        const { gmail } = await getAuthenticatedGmailClientForAccount(send.gmailAccountId.toString());
        const response = await gmail.users.threads.get({
          userId: "me",
          id: send.gmailThreadId!,
          format: "full",
        });
        checkedThreads += 1;

        for (const message of response.data.messages ?? []) {
          const messageId = message.id;
          if (!messageId || messageId === send.gmailMessageId) continue;

          const headers = message.payload?.headers;
          const fromHeader = headerValue(headers, "From");
          const fromEmail = extractEmail(fromHeader);
          if (!fromEmail || fromEmail === send.senderEmail.toLowerCase()) continue;

          const internalDate = message.internalDate ? Number(message.internalDate) : Date.now();
          try {
            await EmailReply.create({
              emailSendId: send._id,
              gmailAccountId: send.gmailAccountId,
              contactId: send.contactId,
              gmailThreadId: send.gmailThreadId,
              gmailMessageId: messageId,
              fromEmail,
              toEmail: extractEmail(headerValue(headers, "To")) || undefined,
              subject: headerValue(headers, "Subject").slice(0, 500) || undefined,
              snippet: (message.snippet ?? "").slice(0, 2000),
              receivedAt: new Date(Number.isFinite(internalDate) ? internalDate : Date.now()),
            });
            savedReplies += 1;
          } catch (error) {
            if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) {
              throw error;
            }
          }
        }

        await EmailSend.updateOne(
          { _id: send._id },
          { $set: { lastReplyCheckedAt: new Date() } }
        );
      } catch (error) {
        skippedThreads += 1;
        console.error("Could not poll a Gmail thread:", send.gmailThreadId, error);
      }
    }

    return NextResponse.json({ checkedThreads, savedReplies, skippedThreads, checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Reply polling failed:", error);
    return NextResponse.json({ error: "Unable to poll Gmail replies." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
