import "server-only";

import { randomUUID } from "node:crypto";
import { connectDB } from "@/lib/mongodb";
import MailerWorkerLock from "@/models/MailerWorkerLock";

const LOCK_KEY = "email-scheduler";
const LOCK_DURATION_MS = 10 * 60 * 1000;

export async function acquireMailerWorkerLock() {
  await connectDB();

  const owner = randomUUID();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);

  try {
    const lock = await MailerWorkerLock.create({
      key: LOCK_KEY,
      owner,
      lockedUntil,
    });

    return { acquired: true as const, owner: lock.owner };
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== 11000
    ) {
      throw error;
    }
  }

  const lock = await MailerWorkerLock.findOneAndUpdate(
    { key: LOCK_KEY, lockedUntil: { $lte: now } },
    { $set: { owner, lockedUntil } },
    { new: true }
  ).lean();

  if (!lock || lock.owner !== owner) {
    return { acquired: false as const };
  }

  return { acquired: true as const, owner };
}

export async function renewMailerWorkerLock(owner: string) {
  await connectDB();
  const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
  const lock = await MailerWorkerLock.findOneAndUpdate(
    { key: LOCK_KEY, owner, lockedUntil: { $gt: new Date() } },
    { $set: { lockedUntil } },
    { new: true }
  ).lean();

  return Boolean(lock);
}

export async function releaseMailerWorkerLock(owner: string) {
  await connectDB();
  const result = await MailerWorkerLock.deleteOne({ key: LOCK_KEY, owner });
  return result.deletedCount === 1;
}
