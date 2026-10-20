import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { connectDB } from "@/lib/mongodb";
import GmailAccount from "@/models/GmailAccount";
import MailerSettings from "@/models/MailerSettings";

export async function GET() {
  try {
    await connectDB();

    const settings = await MailerSettings.findOne({ key: "default" })
      .populate({
        path: "activeGmailAccountId",
        select: "email status connectedAt",
      })
      .lean();

    const account = settings?.activeGmailAccountId as
      | { _id: mongoose.Types.ObjectId; email: string; status: string; connectedAt: Date }
      | null
      | undefined;

    return NextResponse.json({
      activeAccount:
        account?.status === "connected"
          ? {
              id: account._id.toString(),
              email: account.email,
              status: account.status,
              connectedAt: account.connectedAt,
            }
          : null,
    });
  } catch (error) {
    console.error("Failed to retrieve active Gmail account:", error);

    return NextResponse.json(
      { error: "Failed to retrieve active Gmail account." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const accountId =
      typeof body?.accountId === "string" ? body.accountId : "";

    if (!mongoose.isValidObjectId(accountId)) {
      return NextResponse.json(
        { error: "A valid Gmail account ID is required." },
        { status: 400 }
      );
    }

    await connectDB();

    const account = await GmailAccount.findOne({
      _id: accountId,
      status: "connected",
    }).select("_id email status connectedAt");

    if (!account) {
      return NextResponse.json(
        { error: "That Gmail account is not connected." },
        { status: 404 }
      );
    }

    const settings = await MailerSettings.findOneAndUpdate(
      { key: "default" },
      {
        $set: { activeGmailAccountId: account._id },
        $setOnInsert: { key: "default" },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    );

    return NextResponse.json({
      success: true,
      activeAccount: {
        id: account._id.toString(),
        email: account.email,
        status: account.status,
        connectedAt: account.connectedAt,
      },
    });
  } catch (error) {
    console.error("Failed to select active Gmail account:", error);

    return NextResponse.json(
      { error: "Failed to select active Gmail account." },
      { status: 500 }
    );
  }
}