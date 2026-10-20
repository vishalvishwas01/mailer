import "server-only";

import { DateTime } from "luxon";
import { connectDB } from "@/lib/mongodb";
import MailerSchedule from "@/models/MailerSchedule";
import MailerScheduleState from "@/models/MailerScheduleState";
import EmailSend from "@/models/EmailSend";

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

  const state = await MailerScheduleState.findOne({ key: "default" }).lean();
  const storedCount = state?.localDate === localDate ? state.dailyCount : 0;

  const dayStart = currentTime.startOf("day").toUTC().toJSDate();
  const dayEnd = currentTime.plus({ days: 1 }).startOf("day").toUTC().toJSDate();
  const historicalCount = await EmailSend.countDocuments({
    status: { $in: ["sending", "sent", "unknown"] },
    attemptedAt: { $gte: dayStart, $lt: dayEnd },
  });

  if (Math.max(storedCount, historicalCount) >= schedule.dailyLimit) {
    return { eligible: false, reason: "Daily sending limit reached." };
  }

  const lastSend = await EmailSend.findOne({
    status: { $in: ["sending", "sent", "unknown"] },
  })
    .sort({ attemptedAt: -1 })
    .select("attemptedAt")
    .lean();

  const lastReservation = state?.lastReservedAt;
  const lastActivity =
    lastSend &&
    (!lastReservation ||
      new Date(lastSend.attemptedAt).getTime() >
        new Date(lastReservation).getTime())
      ? new Date(lastSend.attemptedAt)
      : lastReservation;

  if (lastActivity) {
    const elapsedMinutes =
      (now.getTime() - new Date(lastActivity).getTime()) / 60_000;
    if (elapsedMinutes < schedule.intervalMinutes) {
      return {
        eligible: false,
        reason: `Wait until the ${schedule.intervalMinutes}-minute interval has elapsed.`,
      };
    }
  }

  return { eligible: true, reason: "Eligible to send." };
}
