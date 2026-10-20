import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runEmailWorker } from "@/lib/email-worker";

function hasValidCronSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32) return false;
  const supplied = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) {
    return NextResponse.json(
      { enabled: false, error: "CRON_SECRET must be configured with at least 32 characters." },
      { status: 503 }
    );
  }
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized worker request." }, { status: 401 });
  }

  try {
    const result = await runEmailWorker();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Email worker run failed:", error);
    return NextResponse.json({ error: "Email worker run failed." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
