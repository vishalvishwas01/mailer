import "server-only";

import mongoose from "mongoose";
import { DateTime } from "luxon";
import { connectDB } from "@/lib/mongodb";
import MailerSchedule from "@/models/MailerSchedule";
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

function getWindowBounds(current: DateTime, startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  const currentMinutes = current.hour * 60 + current.minute;
  const overnight = startMinutes >= endMinutes;
  const belongsToPreviousWindow = overnight && currentMinutes < endMinutes;
  const windowDateTime = belongsToPreviousWindow ? current.minus({ days: 1 }) : current;
  const localDate = windowDateTime.toISODate();

  if (!localDate) return null;

  const windowStart = DateTime.fromISO(localDate, { zone: current.zone })
    .set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
  const windowEndDate = overnight ? windowStart.plus({ days: 1 }) : windowStart;
  const windowEnd = windowEndDate.set({
    hour: endHour,
    minute: endMinute,
    second: 0,
    millisecond: 0,
  });

  return {
    localDate,
    windowStart: windowStart.toUTC().toJSDate(),
    windowEnd: windowEnd.toUTC().toJSDate(),
  };
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
  const schedule = await MailerSchedule.findOne({ key: "default" }).lean();
  if (!schedule || !schedule.enabled) {
    return { reserved: false, reason: "Scheduling is disabled or missing." };
  }

  const localNow = DateTime.fromJSDate(now, { zone: schedule.timezone });
  if (!localNow.isValid) {
    return { reserved: false, reason: "Invalid schedule timezone." };
  }

  if (!isInsideWindow(localNow, schedule.startTime, schedule.endTime)) {
    return { reserved: false, reason: "Outside the sending window." };
  }

  const bounds = getWindowBounds(localNow, schedule.startTime, schedule.endTime);
  if (!bounds) {
    return { reserved: false, reason: "Unable to determine local schedule window." };
  }

  if (existingReservation) {
    if (existingReservation.localDate !== bounds.localDate) {
      return {
        reserved: false,
        reason: "A reservation from an earlier sending window exists; this queue item requires manual review.",
      };
    }
    return {
      reserved: true,
      reservedAt: existingReservation.reservedAt,
      localDate: existingReservation.localDate,
      alreadyReserved: true,
    };
  }

  const reservationsInWindow = await MailerScheduleReservation.countDocuments({
    localDate: bounds.localDate,
  });
  const reservedQueueIds = await MailerScheduleReservation.distinct("queueItemId", {
    localDate: bounds.localDate,
  });
  const reservedQueueItems = await EmailQueueItem.find({
    _id: { $in: reservedQueueIds },
  }).select("emailDraftId").lean();
  const reservedDraftIds = reservedQueueItems.map((item) => item.emailDraftId);

  const manualSendsInWindow = await EmailSend.countDocuments({
    status: { $in: ["sending", "sent", "unknown"] },
    attemptedAt: { $gte: bounds.windowStart, $lt: bounds.windowEnd },
    emailDraftId: { $nin: reservedDraftIds },
  });

  if (reservationsInWindow + manualSendsInWindow >= schedule.dailyLimit) {
    return { reserved: false, reason: "Daily sending limit reached for this sending window." };
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

  // The unique reservation record is the durable, idempotent slot. The
  // worker lock serializes regular scheduling attempts. Fail closed on errors.
  try {
    const reservation = await MailerScheduleReservation.create({
      queueItemId: new mongoose.Types.ObjectId(queueItemId),
      localDate: bounds.localDate,
      reservedAt: now,
    });

    return {
      reserved: true,
      reservedAt: reservation.reservedAt,
      localDate: bounds.localDate,
    };
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
}
