import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";
import GmailAccount from "@/models/GmailAccount";

export async function GET() {
  try {
    await connectDB();

    const accounts = await GmailAccount.find({
      status: "connected",
    })
      .select("email status connectedAt")
      .sort({ connectedAt: -1 })
      .lean();

    return NextResponse.json({
      accounts: accounts.map((account) => ({
        id: account._id.toString(),
        email: account.email,
        status: account.status,
        connectedAt: account.connectedAt,
      })),
    });
  } catch (error) {
    console.error("Failed to list Gmail accounts:", error);

    return NextResponse.json(
      { error: "Failed to retrieve connected Gmail accounts." },
      { status: 500 }
    );
  }
}