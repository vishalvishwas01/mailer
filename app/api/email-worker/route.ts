import { NextResponse } from "next/server";
import { runEmailWorker } from "@/lib/email-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deliberately disabled while email delivery and endpoint authentication are
// unfinished. Calling this endpoint cannot claim queue items or send mail.
export async function POST() {
  return NextResponse.json(
    {
      enabled: false,
      message:
        "The scheduler worker endpoint is disabled until authentication and delivery safeguards are complete.",
    },
    { status: 503 }
  );
}
