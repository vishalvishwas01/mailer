import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import MailerSchedule from "@/models/MailerSchedule";
import { DateTime } from "luxon";

function isValidTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  );
}

function isValidTimezone(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 100 &&
    DateTime.now().setZone(value).isValid
  );
}

export async function GET() {
  try {
    await connectDB();

    const schedule = await MailerSchedule.findOneAndUpdate(
      { key: "default" },
      { $setOnInsert: { key: "default" } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({ schedule });
  } catch (error) {
    console.error("Failed to fetch mailer schedule:", error);
    return NextResponse.json(
      { error: "Unable to fetch schedule settings." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body: unknown = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;

    if (
      typeof data.enabled !== "boolean" ||
      !isValidTime(data.startTime) ||
      !isValidTime(data.endTime) ||
      !isValidTimezone(data.timezone) ||
      !Number.isInteger(data.intervalMinutes) ||
      (data.intervalMinutes as number) < 5 ||
      (data.intervalMinutes as number) > 1440 ||
      !Number.isInteger(data.dailyLimit) ||
      (data.dailyLimit as number) < 1 ||
      (data.dailyLimit as number) > 500
    ) {
      return NextResponse.json(
        { error: "Invalid schedule settings. Check the time, timezone, interval, and daily limit." },
        { status: 400 }
      );
    }

    await connectDB();

    const schedule = await MailerSchedule.findOneAndUpdate(
      { key: "default" },
      {
        $set: {
          enabled: data.enabled,
          startTime: data.startTime,
          endTime: data.endTime,
          timezone: data.timezone,
          intervalMinutes: data.intervalMinutes,
          dailyLimit: data.dailyLimit,
        },
        $setOnInsert: { key: "default" },
      },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    return NextResponse.json({ schedule });
  } catch (error) {
    console.error("Failed to update mailer schedule:", error);
    return NextResponse.json(
      { error: "Unable to update schedule settings." },
      { status: 500 }
    );
  }
}