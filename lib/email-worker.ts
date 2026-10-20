import "server-only";

import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import EmailQueueItem from "@/models/EmailQueueItem";
import EmailDraft from "@/models/EmailDraft";
import EmailSend from "@/models/EmailSend";
import Contact from "@/models/Contact";
import CampaignDraft from "@/models/CampaignDraft";
import Resume from "@/models/Resume";
import { readResumeFile } from "@/lib/gridfs";
import { createRawEmail } from "@/lib/mime-email";
import { getAuthenticatedGmailClientForAccount } from "@/lib/gmail-client";
import { checkMailerEligibility } from "@/lib/mailer-scheduler";
import { reserveMailerScheduleSlot } from "@/lib/mailer-schedule-reservation";
import {
  acquireMailerWorkerLock,
  releaseMailerWorkerLock,
} from "@/lib/mailer-worker-lock";

async function finishQueueItem(
  id: mongoose.Types.ObjectId,
  status: "sent" | "failed" | "unknown",
  message?: string
) {
  await EmailQueueItem.updateOne(
    { _id: id, status: "processing" },
    {
      $set: {
        status,
        ...(message ? { lastError: message.slice(0, 2000) } : {}),
      },
      $unset: { lockedUntil: 1 },
    }
  );
}

export async function runEmailWorker() {
  const lock = await acquireMailerWorkerLock();
  if (!lock.acquired) {
    return { processed: false, reason: "Another worker currently holds the scheduler lock." };
  }

  try {
    const eligibility = await checkMailerEligibility();
    if (!eligibility.eligible) return { processed: false, reason: eligibility.reason };

    await connectDB();

    // Never requeue an expired attempt automatically: Gmail may have accepted it.
    await EmailQueueItem.updateMany(
      { status: "processing", lockedUntil: { $lte: new Date() } },
      {
        $set: {
          status: "unknown",
          lastError: "Worker lease expired. Verify Gmail Sent before any manual retry.",
        },
        $unset: { lockedUntil: 1 },
      }
    );

    const candidate = await EmailQueueItem.findOne({
      status: "queued",
      scheduledFor: { $lte: new Date() },
    }).sort({ scheduledFor: 1, createdAt: 1 }).lean();

    if (!candidate) return { processed: false, reason: "No eligible queue items are available." };

    const reservation = await reserveMailerScheduleSlot(candidate._id.toString());
    if (!reservation.reserved) {
      if (reservation.reason.includes("earlier sending window")) {
        await EmailQueueItem.updateOne(
          { _id: candidate._id, status: "queued" },
          { $set: { status: "failed", lastError: reservation.reason } }
        );
        return {
          processed: true,
          queueItemId: candidate._id.toString(),
          status: "failed",
          reason: reservation.reason,
        };
      }
      return { processed: false, reason: reservation.reason };
    }

    const item = await EmailQueueItem.findOneAndUpdate(
      { _id: candidate._id, status: "queued", scheduledFor: { $lte: new Date() } },
      {
        $set: {
          status: "processing",
          claimedAt: new Date(),
          lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
        },
        $inc: { attempts: 1 },
      },
      { new: true }
    );

    if (!item) {
      return { processed: false, reason: "Reserved slot could not claim the queue item; the slot remains consumed." };
    }

    const draft = await EmailDraft.findById(item.emailDraftId).lean();
    if (!draft || draft.status !== "approved") {
      await finishQueueItem(item._id, "failed", "Draft is missing or no longer approved.");
      return { processed: true, queueItemId: item.id, status: "failed", reason: "Draft is missing or no longer approved." };
    }

    const contact = await Contact.findById(item.contactId).lean();
    if (!contact?.email) {
      await finishQueueItem(item._id, "failed", "Recipient contact or email address is missing.");
      return { processed: true, queueItemId: item.id, status: "failed", reason: "Recipient contact or email address is missing." };
    }

    const campaign = await CampaignDraft.findById(draft.campaignDraftId).lean();
    const resume = campaign ? await Resume.findById(campaign.resumeId).lean() : null;
    if (!resume) {
      await finishQueueItem(item._id, "failed", "Campaign resume is missing; email was not sent.");
      return { processed: true, queueItemId: item.id, status: "failed", reason: "Campaign resume is missing." };
    }

    let resumeBuffer: Buffer;
    try {
      resumeBuffer = await readResumeFile(resume.fileId);
      if (!resumeBuffer.length || resumeBuffer.length > 5 * 1024 * 1024) {
        throw new Error("Resume attachment is empty or exceeds 5 MB.");
      }
    } catch (error) {
      await finishQueueItem(item._id, "failed", "Could not read the campaign resume; email was not sent.");
      console.error("Could not load campaign resume attachment:", error);
      return { processed: true, queueItemId: item.id, status: "failed", reason: "Could not load campaign resume attachment." };
    }

    const existingSend = await EmailSend.findOne({
      $or: [
        { emailDraftId: item.emailDraftId },
        { campaignDraftId: item.campaignDraftId, contactId: item.contactId },
      ],
    }).lean();

    if (existingSend) {
      const terminalStatus =
        existingSend.status === "sent" ? "sent" :
        existingSend.status === "failed" ? "failed" : "unknown";
      await finishQueueItem(
        item._id,
        terminalStatus,
        terminalStatus === "unknown"
          ? "A prior send attempt exists with an uncertain outcome. Verify Gmail Sent before proceeding."
          : "A prior send record exists; duplicate sending was prevented."
      );
      return {
        processed: true,
        queueItemId: item.id,
        status: terminalStatus,
        reason: "Existing send record found; no second email was sent.",
      };
    }

    let sendRecord: Awaited<ReturnType<typeof EmailSend.create>>;
    try {
      sendRecord = await EmailSend.create({
        campaignDraftId: item.campaignDraftId,
        emailDraftId: item.emailDraftId,
        contactId: item.contactId,
        gmailAccountId: item.gmailAccountId,
        recipientEmail: contact.email,
        senderEmail: item.senderEmail,
        status: "sending",
        attemptedAt: new Date(),
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) {
        await finishQueueItem(item._id, "unknown", "Duplicate send record conflict; no second send was attempted.");
        return { processed: true, queueItemId: item.id, status: "unknown", reason: "Duplicate send record conflict." };
      }
      await finishQueueItem(item._id, "failed", "Could not create a durable send record.");
      throw error;
    }

    try {
      const { gmail, account } = await getAuthenticatedGmailClientForAccount(item.gmailAccountId.toString());
      if (account.email.toLowerCase() !== item.senderEmail.toLowerCase()) {
        await EmailSend.findByIdAndUpdate(sendRecord._id, {
          status: "failed",
          errorMessage: "Queue sender email no longer matches the connected Gmail account.",
        });
        await finishQueueItem(item._id, "failed", "Queue sender email no longer matches the connected Gmail account.");
        return { processed: true, queueItemId: item.id, status: "failed", reason: "Sender account mismatch." };
      }

      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: createRawEmail({
          from: account.email,
          to: contact.email,
          subject: draft.subject,
          body: draft.body,
          attachment: {
            filename: resume.originalName,
            mimeType: resume.mimeType,
            content: resumeBuffer,
          },
        }) },
      });

      if (!response.data.id) {
        const message = "Gmail returned no message ID. Verify Gmail Sent before retrying.";
        await EmailSend.findByIdAndUpdate(sendRecord._id, { status: "unknown", errorMessage: message });
        await finishQueueItem(item._id, "unknown", message);
        return { processed: true, queueItemId: item.id, status: "unknown", reason: message };
      }

      await EmailSend.findByIdAndUpdate(sendRecord._id, {
        status: "sent",
        gmailMessageId: response.data.id,
        ...(response.data.threadId ? { gmailThreadId: response.data.threadId } : {}),
        sentAt: new Date(),
        $unset: { errorMessage: 1 },
      });
      await finishQueueItem(item._id, "sent");
      return {
        processed: true,
        queueItemId: item.id,
        status: "sent",
        senderEmail: account.email,
        recipientEmail: contact.email,
        gmailMessageId: response.data.id,
        gmailThreadId: response.data.threadId ?? null,
      };
    } catch (error) {
      // Network/provider errors can happen after Gmail accepted the message.
      // Unknown is deliberate: no automatic retry that might duplicate email.
      const message = "Gmail send outcome could not be confirmed. Check Gmail Sent before retrying.";
      await EmailSend.findByIdAndUpdate(sendRecord._id, { status: "unknown", errorMessage: message });
      await finishQueueItem(item._id, "unknown", message);
      console.error("Queued Gmail send outcome unknown:", error);
      return { processed: true, queueItemId: item.id, status: "unknown", reason: message };
    }
  } finally {
    await releaseMailerWorkerLock(lock.owner);
  }
}
