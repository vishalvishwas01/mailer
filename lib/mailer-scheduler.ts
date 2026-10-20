import "server-only";

import { DateTime } from "luxon";
import { connectDB } from "@/lib/mongodb";
import MailerSchedule from "@/models/MailerSchedule";
import MailerScheduleReservation from "@/models/MailerScheduleReservation";
import EmailSend from "@/models/EmailSend";
import EmailQueueItem from "@/models/EmailQueueItem";

type EligibilityResult =
  | { eligible: true; reason: "Eligible to send." }
  | { eligible: false; reason: string };

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

export async function checkMailerEligibility(
  now: Date = new Date()
): Promise<EligibilityResult> {
  await connectDB();

  const schedule = await MailerSchedule.findOne({ key: "default" }).lean();
  if (!schedule) {
    return { eligible: false, reason: "Schedule settings are missing." };
  }
  if (!schedule.enabled) {
    return { eligible: false, reason: "Scheduling is disabled." };
  }

  const currentTime = DateTime.fromJSDate(now, { zone: schedule.timezone });
  if (!currentTime.isValid) {
    return { eligible: false, reason: "Invalid schedule timezone." };
  }
  if (!isInsideWindow(currentTime, schedule.startTime, schedule.endTime)) {
    return { eligible: false, reason: "Outside the sending window." };
  }

  const bounds = getWindowBounds(currentTime, schedule.startTime, schedule.endTime);
  if (!bounds) {
    return { eligible: false, reason: "Unable to determine local schedule window." };
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
    return {
      eligible: false,
      reason: "Daily sending limit reached for this sending window.",
    };
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
      eligible: false,
      reason: `Wait until the ${schedule.intervalMinutes}-minute interval has elapsed.`,
    };
  }

  return { eligible: true, reason: "Eligible to send." };
}
