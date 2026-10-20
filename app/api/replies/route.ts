import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import EmailReply from "@/models/EmailReply";

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "25")));
    const contactId = request.nextUrl.searchParams.get("contactId");
    const filter: Record<string, unknown> = {};
    if (contactId) {
      if (!mongoose.Types.ObjectId.isValid(contactId)) {
        return NextResponse.json({ error: "Invalid contactId." }, { status: 400 });
      }
      filter.contactId = new mongoose.Types.ObjectId(contactId);
    }

    const [replies, total] = await Promise.all([
      EmailReply.find(filter).sort({ receivedAt: -1 }).skip((page - 1) * limit).limit(limit)
        .populate("contactId", "email name company")
        .populate("emailSendId", "recipientEmail senderEmail sentAt gmailThreadId")
        .lean(),
      EmailReply.countDocuments(filter),
    ]);

    return NextResponse.json({ replies, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("Failed to load email replies:", error);
    return NextResponse.json({ error: "Unable to load email replies." }, { status: 500 });
  }
}
