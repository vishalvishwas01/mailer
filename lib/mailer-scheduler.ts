import "server-only";

import { DateTime } from "luxon";
import { connectDB } from "@/lib/mongodb";
import MailerSchedule from "@/models/MailerSchedule";
import MailerScheduleState from "@/models/MailerScheduleState";
import MailerScheduleReservation from "@/models/MailerScheduleReservation";
import EmailSend from "@/models/EmailSend";
import EmailQueueItem from "@/models/EmailQueueItem";

type EligibilityResult =
  | { eligible: true; reason: "Eligible to send." }
  | { eligible: false; reason: string };

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

  const [startHour, startMinute] = schedule.startTime.split(":").map(Number);
  const [endHour, endMinute] = schedule.endTime.split(":").map(Number);
  const currentMinutes = currentTime.hour * 60 + currentTime.minute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  const insideWindow =
    startMinutes === endMinutes
      ? true
      : startMinutes < endMinutes
        ? currentMinutes >= startMinutes && currentMinutes < endMinutes
        : currentMinutes >= startMinutes || currentMinutes < endMinutes;

  if (!insideWindow) {
    return { eligible: false, reason: "Outside the sending window." };
  }

  const localDate = currentTime.toISODate();
  if (!localDate) {
    return { eligible: false, reason: "Unable to determine local schedule date." };
  }

  const dayStart = currentTime.startOf("day").toUTC().toJSDate();
  const dayEnd = currentTime.plus({ days: 1 }).startOf("day").toUTC().toJSDate();

  const reservationsToday = await MailerScheduleReservation.countDocuments({
    localDate,
  });
  const reservedQueueIds = await MailerScheduleReservation.distinct("queueItemId", {
    localDate,
  });
  const reservedQueueItems = await EmailQueueItem.find({
    _id: { $in: reservedQueueIds },
  }).select("emailDraftId").lean();
  const reservedDraftIds = reservedQueueItems.map((item) => item.emailDraftId);

  const manualSendsToday = await EmailSend.countDocuments({
    status: { $in: ["sending", "sent", "unknown"] },
    attemptedAt: { $gte: dayStart, $lt: dayEnd },
    emailDraftId: { $nin: reservedDraftIds },
  });

  const state = await MailerScheduleState.findOne({ key: "default" }).lean();
  const dailyCount = Math.max(
    state?.localDate === localDate ? state.dailyCount : 0,
    reservationsToday + manualSendsToday
  );

  if (dailyCount >= schedule.dailyLimit) {
    return { eligible: false, reason: "Daily sending limit reached." };
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
    latestReservation?.reservedAt
      ? new Date(latestReservation.reservedAt).getTime()
      : 0,
    latestSend?.attemptedAt
      ? new Date(latestSend.attemptedAt).getTime()
      : 0,
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
