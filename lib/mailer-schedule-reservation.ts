import "server-only";

import mongoose from "mongoose";
import { DateTime } from "luxon";
import { connectDB } from "@/lib/mongodb";
import MailerSchedule from "@/models/MailerSchedule";
import MailerScheduleState from "@/models/MailerScheduleState";
import MailerScheduleReservation from "@/models/MailerScheduleReservation";
import EmailSend from "@/models/EmailSend";

type ReservationResult =
  | { reserved: true; reservedAt: Date; localDate: string; alreadyReserved?: boolean }
  | { reserved: false; reason: string };

function isInsideWindow(
  current: DateTime,
  startTime: string,
  endTime: string
): boolean {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const minuteOfDay = current.hour * 60 + current.minute;
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;

  if (start === end) return true;
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
}

export async function reserveMailerScheduleSlot(
  queueItemId: string,
  now: Date = new Date()
): Promise<ReservationResult> {
  if (!mongoose.Types.ObjectId.isValid(queueItemId)) {
    return { reserved: false, reason: "Invalid queue item ID." };
  }

  await connectDB();

  // Idempotency: a queue item that already owns a reservation must never
  // increment the schedule counters a second time.
  const existingReservation = await MailerScheduleReservation.findOne({
    queueItemId,
  }).lean();

  if (existingReservation) {
    return {
      reserved: true,
      reservedAt: existingReservation.reservedAt,
      localDate: existingReservation.localDate,
      alreadyReserved: true,
    };
  }

  const schedule = await MailerSchedule.findOne({ key: "default" }).lean();
  if (!schedule || !schedule.enabled) {
    return { reserved: false, reason: "Scheduling is disabled or missing." };
  }

  const localNow = DateTime.fromJSDate(now, { zone: schedule.timezone });
  if (!localNow.isValid) {
    return { reserved: false, reason: "Invalid schedule timezone." };
  }

  const localDate = localNow.toISODate();
  if (!localDate) {
    return { reserved: false, reason: "Unable to determine local date." };
  }

  if (!isInsideWindow(localNow, schedule.startTime, schedule.endTime)) {
    return { reserved: false, reason: "Outside the sending window." };
  }

  const dayStart = localNow.startOf("day").toUTC().toJSDate();
  const dayEnd = localNow.plus({ days: 1 }).startOf("day").toUTC().toJSDate();

  // Reconcile history first so deployments with earlier manual sends do not
  // begin with an empty daily counter. Reservation records and send records
  // are counted by queue item/email draft, avoiding double counting a send
  // that already has a reservation.
  const alreadyReservedSendDraftIds = await MailerScheduleReservation.distinct(
    "queueItemId"
  );
  const reservedQueueItems = await mongoose.model("EmailQueueItem").find({
    _id: { $in: alreadyReservedSendDraftIds },
  }).select("emailDraftId").lean();
  const reservedEmailDraftIds = reservedQueueItems.map((item: { emailDraftId: mongoose.Types.ObjectId }) => item.emailDraftId);

  const historicalSends = await EmailSend.find({
    status: { $in: ["sending", "sent", "unknown"] },
    attemptedAt: { $gte: dayStart, $lt: dayEnd },
    emailDraftId: { $nin: reservedEmailDraftIds },
  })
    .select("attemptedAt emailDraftId")
    .sort({ attemptedAt: -1 })
    .lean();

  const stateNow = await MailerScheduleState.findOne({ key: "default" }).lean();
  const storedDailyCount =
    stateNow?.localDate === localDate ? stateNow.dailyCount : 0;
  const effectiveDailyCount = Math.max(storedDailyCount, historicalSends.length);

  const latestHistoricalSend = historicalSends[0];
  const lastReservedAt =
    stateNow?.lastReservedAt && stateNow.localDate === localDate
      ? stateNow.lastReservedAt
      : undefined;
  const latestActivity =
    latestHistoricalSend &&
    (!lastReservedAt ||
      new Date(latestHistoricalSend.attemptedAt).getTime() >
        new Date(lastReservedAt).getTime())
      ? new Date(latestHistoricalSend.attemptedAt)
      : lastReservedAt;

  if (effectiveDailyCount >= schedule.dailyLimit) {
    return { reserved: false, reason: "Daily sending limit reached." };
  }

  // Respect the interval across calendar-day boundaries too.
  if (stateNow?.lastReservedAt) {
    const elapsed = now.getTime() - new Date(stateNow.lastReservedAt).getTime();
    if (elapsed < schedule.intervalMinutes * 60_000) {
      return {
        reserved: false,
        reason: `Wait until the ${schedule.intervalMinutes}-minute interval has elapsed.`,
      };
    }
  }

  if (latestActivity) {
    const elapsed = now.getTime() - latestActivity.getTime();
    if (elapsed < schedule.intervalMinutes * 60_000) {
      return {
        reserved: false,
        reason: `Wait until the ${schedule.intervalMinutes}-minute interval has elapsed.`,
      };
    }
  }

  // Initialize state without racing into an upsert duplicate-key failure.
  try {
    await MailerScheduleState.updateOne(
      { key: "default" },
      {
        $setOnInsert: {
          key: "default",
          localDate,
          dailyCount: 0,
        },
      },
      { upsert: true }
    );
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

  // A conditional atomic update is the final concurrency guard. The worker
  // lock is also required by the worker, but this check protects state itself.
  const state = await MailerScheduleState.findOneAndUpdate(
    {
      key: "default",
      $or: [
        { localDate: { $ne: localDate } },
        {
          localDate,
          dailyCount: { $lt: schedule.dailyLimit },
          $or: [
            { lastReservedAt: { $exists: false } },
            {
              lastReservedAt: {
                $lte: new Date(now.getTime() - schedule.intervalMinutes * 60_000),
              },
            },
          ],
        },
      ],
    },
    [
      {
        $set: {
          localDate,
          dailyCount: {
            $cond: [
              { $eq: ["$localDate", localDate] },
              { $max: [{ $ifNull: ["$dailyCount", 0] }, effectiveDailyCount] },
              effectiveDailyCount,
            ],
          },
          lastReservedAt: now,
          lastQueueItemId: { $literal: new mongoose.Types.ObjectId(queueItemId) },
        },
      },
      {
        $set: {
          dailyCount: { $add: ["$dailyCount", 1] },
        },
      },
    ],
    { new: true }
  ).lean();

  if (!state) {
    return {
      reserved: false,
      reason: "Daily limit reached or sending interval has not elapsed.",
    };
  }

  try {
    const reservation = await MailerScheduleReservation.create({
      queueItemId: new mongoose.Types.ObjectId(queueItemId),
      localDate,
      reservedAt: now,
    });

    return {
      reserved: true,
      reservedAt: reservation.reservedAt,
      localDate,
    };
  } catch (error) {
    // A unique-key race means a reservation already exists. Do not decrement
    // the global counter because another actor may have updated it after us.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      const reservation = await MailerScheduleReservation.findOne({
        queueItemId,
      }).lean();

      if (reservation) {
        return {
          reserved: true,
          reservedAt: reservation.reservedAt,
          localDate: reservation.localDate,
          alreadyReserved: true,
        };
      }
      return {
        reserved: false,
        reason: "Reservation conflict. Retry the worker later.",
      };
    }
    throw error;
  }
}
