import "server-only";

import mongoose from "mongoose";
import { DateTime } from "luxon";
import { connectDB } from "@/lib/mongodb";
import MailerSchedule from "@/models/MailerSchedule";
import MailerScheduleState from "@/models/MailerScheduleState";
import MailerScheduleReservation from "@/models/MailerScheduleReservation";
import EmailSend from "@/models/EmailSend";
import EmailQueueItem from "@/models/EmailQueueItem";

type ReservationResult =
  | { reserved: true; reservedAt: Date; localDate: string; alreadyReserved?: boolean }
  | { reserved: false; reason: string };

function isInsideWindow(current: DateTime, startTime: string, endTime: string) {
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

  const existingReservation = await MailerScheduleReservation.findOne({ queueItemId }).lean();
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
    return { reserved: false, reason: "Unable to determine local schedule date." };
  }

  if (!isInsideWindow(localNow, schedule.startTime, schedule.endTime)) {
    return { reserved: false, reason: "Outside the sending window." };
  }

  const dayStart = localNow.startOf("day").toUTC().toJSDate();
  const dayEnd = localNow.plus({ days: 1 }).startOf("day").toUTC().toJSDate();

  const reservationsToday = await MailerScheduleReservation.countDocuments({ localDate });
  const reservedQueueIds = await MailerScheduleReservation.distinct("queueItemId", { localDate });
  const reservedQueueItems = await EmailQueueItem.find({
    _id: { $in: reservedQueueIds },
  }).select("emailDraftId").lean();
  const reservedDraftIds = reservedQueueItems.map((item) => item.emailDraftId);

  const manualSendsToday = await EmailSend.countDocuments({
    status: { $in: ["sending", "sent", "unknown"] },
    attemptedAt: { $gte: dayStart, $lt: dayEnd },
    emailDraftId: { $nin: reservedDraftIds },
  });

  const dailyCount = reservationsToday + manualSendsToday;
  if (dailyCount >= schedule.dailyLimit) {
    return { reserved: false, reason: "Daily sending limit reached." };
  }

  const latestReservation = await MailerScheduleReservation.findOne()
    .sort({ reservedAt: -1 })
    .select("reservedAt")
    .lean();
  const latestSend = await EmailSend.findOne({
    status: { $in: ["sending", "sent", "unknown"] },
  })
    .sort({ attemptedAt: -1 })
    .select("attemptedAt")
    .lean();
  const lastActivityAt = Math.max(
    latestReservation?.reservedAt ? new Date(latestReservation.reservedAt).getTime() : 0,
    latestSend?.attemptedAt ? new Date(latestSend.attemptedAt).getTime() : 0,
    0
  );

  if (
    lastActivityAt > 0 &&
    now.getTime() - lastActivityAt < schedule.intervalMinutes * 60_000
  ) {
    return {
      reserved: false,
      reason: `Wait until the ${schedule.intervalMinutes}-minute interval has elapsed.`,
    };
  }

  // Create a unique reservation before updating the counter. This is fail-closed:
  // if the process crashes, the slot can be consumed but cannot be consumed twice.
  let reservation: { reservedAt: Date; localDate: string };
  try {
    const created = await MailerScheduleReservation.create({
      queueItemId: new mongoose.Types.ObjectId(queueItemId),
      localDate,
      reservedAt: now,
    });
    reservation = { reservedAt: created.reservedAt, localDate: created.localDate };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      const existing = await MailerScheduleReservation.findOne({ queueItemId }).lean();
      if (existing) {
        return {
          reserved: true,
          reservedAt: existing.reservedAt,
          localDate: existing.localDate,
          alreadyReserved: true,
        };
      }
      return { reserved: false, reason: "Reservation conflict. Retry the worker later." };
    }
    throw error;
  }

  try {
    await MailerScheduleState.updateOne(
      { key: "default" },
      { $setOnInsert: { key: "default", localDate, dailyCount: 0 } },
      { upsert: true }
    );
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== 11000) {
      throw error;
    }
  }

  const state = await MailerScheduleState.findOneAndUpdate(
    { key: "default" },
    [
      {
        $set: {
          dailyCount: {
            $add: [
              {
                $cond: [
                  { $eq: ["$localDate", localDate] },
                  { $ifNull: ["$dailyCount", 0] },
                  dailyCount,
                ],
              },
              1,
            ],
          },
          localDate,
          lastReservedAt: now,
          lastQueueItemId: { $literal: new mongoose.Types.ObjectId(queueItemId) },
        },
      },
    ],
    { new: true }
  ).lean();

  if (!state) {
    return {
      reserved: false,
      reason: "Reservation recorded but scheduler state could not be updated. Slot remains consumed.",
    };
  }

  return { reserved: true, reservedAt: reservation.reservedAt, localDate };
}
