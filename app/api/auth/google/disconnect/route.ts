import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";
import GmailAccount from "@/models/GmailAccount";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email =
      typeof body?.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "A valid Gmail address is required." },
        { status: 400 }
      );
    }

    await connectDB();

    const account = await GmailAccount.findOneAndUpdate(
      { email, status: "connected" },
      {
        $set: { status: "disconnected" },
        $unset: {
          accessTokenEncrypted: 1,
          refreshTokenEncrypted: 1,
          accessTokenExpiresAt: 1,
        },
      },
      { new: true }
    ).select("email status");

    if (!account) {
      return NextResponse.json(
        { error: "No connected Gmail account was found for that address." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      account: {
        email: account.email,
        status: account.status,
      },
    });
  } catch (error) {
    console.error("Gmail disconnect failed:", error);

    return NextResponse.json(
      { error: "Failed to disconnect the Gmail account." },
      { status: 500 }
    );
  }
}