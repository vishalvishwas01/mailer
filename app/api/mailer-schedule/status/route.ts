
import { NextResponse } from "next/server";
import { checkMailerEligibility } from "@/lib/mailer-scheduler";

export async function GET() {
  try {
    const result = await checkMailerEligibility();

    return NextResponse.json({
      eligible: result.eligible,
      reason: result.reason,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to check mailer schedule:", error);

    return NextResponse.json(
      { error: "Unable to check scheduler status." },
      { status: 500 }
    );
  }
}
