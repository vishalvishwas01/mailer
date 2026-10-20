import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";
import GmailAccount from "@/models/GmailAccount";

export async function GET() {
  try {
    await connectDB();

    const account = await GmailAccount.findOne({
      status: "connected",
    })
      .select("email status connectedAt")
      .sort({ connectedAt: -1 })
      .lean();

    return NextResponse.json({
      configured: Boolean(account),
      account: account
        ? {
            email: account.email,
            status: account.status,
            connectedAt: account.connectedAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Failed to retrieve Gmail status:", error);

    return NextResponse.json(
      { error: "Failed to retrieve Gmail connection status." },
      { status: 500 }
    );
  }
}