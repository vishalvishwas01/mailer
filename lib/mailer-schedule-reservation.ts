
import "server-only";

import { DateTime } from "luxon";
import { connectDB } from "@/lib/mongodb";
import MailerSchedule from "@/models/MailerSchedule";
import MailerScheduleState from "@/models/MailerScheduleState";

type ReservationResult =
  | { reserved: true; reservedAt: Date; localDate: string }
  | { reserved: false; reason: string };

export async function reserveMailerScheduleSlot(
  queueItemId: string,
  now: Date = new Date()
): Promise<ReservationResult> {
  await connectDB();

  const schedule = await MailerSchedule.findOne({ key: "default" }).lean();

  if (!schedule || !schedule.enabled) {
    return { reserved: false, reason: "Scheduling is disabled or missing." };
  }

  if (!DateTime.fromJSDate(now, { zone: schedule.timezone }).isValid) {
    return { reserved: false, reason: "Invalid schedule timezone." };
  }

  const localNow = DateTime.fromJSDate(now, { zone: schedule.timezone });
  const localDate = localNow.toISODate();

  if (!localDate) {
    return { reserved: false, reason: "Unable to determine local date." };
  }

  const [startHour, startMinute] = schedule.startTime.split(":").map(Number);
  const [endHour, endMinute] = schedule.endTime.split(":").map(Number);

  const currentMinutes = localNow.hour * 60 + localNow.minute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  const insideWindow =
    startMinutes === endMinutes
      ? true
      : startMinutes < endMinutes
        ? currentMinutes >= startMinutes && currentMinutes < endMinutes
        : currentMinutes >= startMinutes || currentMinutes < endMinutes;

  if (!insideWindow) {
    return { reserved: false, reason: "Outside the sending window." };
  }

  // Initialize the singleton state if it does not exist yet.
  await MailerScheduleState.updateOne(
    { key: "default" },
    { $setOnInsert: { key: "default", localDate, dailyCount: 0 } },
    { upsert: true }
  );

  // Use a conditional atomic update so concurrent workers cannot reserve
  // the same interval or exceed the daily limit.
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
                $lte: new Date(
                  now.getTime() - schedule.intervalMinutes * 60_000
                ),
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
              { $add: [{ $ifNull: ["$dailyCount", 0] }, 1] },
              1,
            ],
          },
          lastReservedAt: now,
          lastQueueItemId: {
            $literal: queueItemId,
          },
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

  return {
    reserved: true,
    reservedAt: now,
    localDate,
  };
}
