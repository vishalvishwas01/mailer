
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Direct queue claiming is disabled. Use the scheduler worker instead.",
    },
    { status: 410 }
  );
}
