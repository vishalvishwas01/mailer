
import "server-only";

import { connectDB } from "@/lib/mongodb";
import EmailQueueItem from "@/models/EmailQueueItem";
import { checkMailerEligibility } from "@/lib/mailer-scheduler";
import { reserveMailerScheduleSlot } from "@/lib/mailer-schedule-reservation";
import {
  acquireMailerWorkerLock,
  releaseMailerWorkerLock,
} from "@/lib/mailer-worker-lock";

export async function runEmailWorker() {
  const lock = await acquireMailerWorkerLock();

  if (!lock.acquired) {
    return {
      processed: false,
      reason: "Another worker currently holds the scheduler lock.",
    };
  }

  try {
    const eligibility = await checkMailerEligibility();

    if (!eligibility.eligible) {
      return {
        processed: false,
        reason: eligibility.reason,
      };
    }

    await connectDB();

    // Find a candidate without changing its status yet.
    const candidate = await EmailQueueItem.findOne({
      status: "queued",
      scheduledFor: { $lte: new Date() },
    })
      .sort({ scheduledFor: 1, createdAt: 1 })
      .lean();

    if (!candidate) {
      return {
        processed: false,
        reason: "No eligible queue items are available.",
      };
    }

    // Reserve the sending slot for this exact queue item.
    const reservation = await reserveMailerScheduleSlot(
      candidate._id.toString()
    );

    if (!reservation.reserved) {
      return {
        processed: false,
        reason: reservation.reason,
      };
    }

    // Claim only the item for which the slot was reserved.
    const item = await EmailQueueItem.findOneAndUpdate(
      {
        _id: candidate._id,
        status: "queued",
        scheduledFor: { $lte: new Date() },
      },
      {
        $set: {
          status: "processing",
          claimedAt: new Date(),
          lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
        },
        $inc: {
          attempts: 1,
        },
      },
      { new: true }
    ).lean();

    if (!item) {
      // Do not reuse the reservation. It may already have consumed a slot.
      return {
        processed: false,
        reason:
          "The reserved queue item could not be claimed. The slot remains consumed.",
      };
    }

    return {
      processed: true,
      reason: "Queue item reserved and claimed. Email delivery is not connected.",
      queueItemId: item._id.toString(),
      emailDraftId: item.emailDraftId.toString(),
      senderEmail: item.senderEmail,
      status: item.status,
      reservedAt: reservation.reservedAt.toISOString(),
    };
  } finally {
    await releaseMailerWorkerLock(lock.owner);
  }
}
