
import { NextResponse } from "next/server";
import { runEmailWorker } from "@/lib/email-worker";

export async function POST() {
  try {
    const result = await runEmailWorker();

    return NextResponse.json(result);
  } catch (error) {
    console.error("Email worker execution failed:", error);

    return NextResponse.json(
      { error: "Unable to execute the email worker." },
      { status: 500 }
    );
  }
}
