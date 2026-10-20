
import "server-only";

import { connectDB } from "@/lib/mongodb";
import EmailQueueItem from "@/models/EmailQueueItem";

const LOCK_DURATION_MS = 5 * 60 * 1000;

export async function claimNextEmail() {
  await connectDB();

  const now = new Date();
  const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);

  const item = await EmailQueueItem.findOneAndUpdate(
    {
      status: "queued",
      scheduledFor: { $lte: now },
    },
    {
      $set: {
        status: "processing",
        claimedAt: now,
        lockedUntil,
      },
      $inc: {
        attempts: 1,
      },
    },
    {
      new: true,
      sort: { scheduledFor: 1, createdAt: 1 },
    }
  ).lean();

  return item;
}

export async function markQueueItemSent(queueItemId: string) {
  await connectDB();

  return EmailQueueItem.findOneAndUpdate(
    {
      _id: queueItemId,
      status: "processing",
    },
    {
      $set: {
        status: "sent",
      },
      $unset: {
        lockedUntil: 1,
        lastError: 1,
      },
    },
    { new: true }
  );
}

export async function markQueueItemFailed(
  queueItemId: string,
  errorMessage: string
) {
  await connectDB();

  return EmailQueueItem.findOneAndUpdate(
    {
      _id: queueItemId,
      status: "processing",
    },
    {
      $set: {
        status: "failed",
        lastError: errorMessage.slice(0, 2000),
      },
      $unset: {
        lockedUntil: 1,
      },
    },
    { new: true }
  );
}

export async function markQueueItemUnknown(
  queueItemId: string,
  errorMessage: string
) {
  await connectDB();

  return EmailQueueItem.findOneAndUpdate(
    {
      _id: queueItemId,
      status: "processing",
    },
    {
      $set: {
        status: "unknown",
        lastError: errorMessage.slice(0, 2000),
      },
      $unset: {
        lockedUntil: 1,
      },
    },
    { new: true }
  );
}
