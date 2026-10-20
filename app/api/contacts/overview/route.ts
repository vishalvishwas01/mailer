import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Contact from "@/models/Contact";
import EmailSend from "@/models/EmailSend";
import EmailQueueItem from "@/models/EmailQueueItem";
import EmailReply from "@/models/EmailReply";

type ContactStatus = "reply_received" | "sent" | "failed" | "sending" | "queued" | "unknown" | "not_sent";

function deriveStatus(contactId: string, sends: any[], queue: any[], replies: any[]): ContactStatus {
  if (replies.some((item) => String(item.contactId) === contactId)) return "reply_received";
  const send = sends.find((item) => String(item.contactId) === contactId);
  if (send?.status === "sent") return "sent";
  if (send?.status === "failed") return "failed";
  if (send?.status === "sending") return "sending";
  if (send?.status === "unknown") return "unknown";
  const queued = queue.find((item) => String(item.contactId) === contactId);
  if (queued?.status === "queued") return "queued";
  if (queued?.status === "processing") return "sending";
  if (queued?.status === "sent") return "sent";
  if (queued?.status === "failed") return "failed";
  if (queued?.status === "unknown") return "unknown";
  return "not_sent";
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(params.get("limit") ?? "20", 10) || 20));
    const search = (params.get("search") ?? "").trim().slice(0, 200);
    const status = params.get("status") ?? "all";
    const view = params.get("view") ?? "contacts";
    const filter: Record<string, unknown> = {};
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { email: { $regex: escaped, $options: "i" } },
        { name: { $regex: escaped, $options: "i" } },
        { company: { $regex: escaped, $options: "i" } },
      ];
    }

    if (view === "queue") {
      const queueStatus = status === "all" ? undefined : status;
      const queueFilter: Record<string, unknown> = {};
      if (queueStatus) queueFilter.status = queueStatus;
      const [items, total] = await Promise.all([
        EmailQueueItem.find(queueFilter).sort({ scheduledFor: 1, createdAt: 1 }).skip((page - 1) * limit).limit(limit)
          .populate("contactId", "email name company")
          .populate("emailDraftId", "subject status")
          .populate("campaignDraftId", "name")
          .populate("gmailAccountId", "email").lean(),
        EmailQueueItem.countDocuments(queueFilter),
      ]);
      return NextResponse.json({ view, items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    }

    const candidates = await Contact.find(filter).select("email name company website sourceFile createdAt").sort({ createdAt: -1, _id: -1 }).limit(20000).lean();
    const ids = candidates.map((contact) => contact._id);
    const [sends, queue, replies] = ids.length ? await Promise.all([
      EmailSend.find({ contactId: { $in: ids } }).select("contactId status recipientEmail senderEmail attemptedAt sentAt errorMessage gmailThreadId").sort({ attemptedAt: -1 }).lean(),
      EmailQueueItem.find({ contactId: { $in: ids } }).select("contactId status scheduledFor lastError attempts senderEmail").sort({ createdAt: -1 }).lean(),
      EmailReply.find({ contactId: { $in: ids } }).select("contactId subject snippet receivedAt fromEmail gmailThreadId").sort({ receivedAt: -1 }).lean(),
    ]) : [[], [], []];

    const latestSends = new Map<string, any>();
    for (const item of sends) if (!latestSends.has(String(item.contactId))) latestSends.set(String(item.contactId), item);
    const latestQueue = new Map<string, any>();
    for (const item of queue) if (!latestQueue.has(String(item.contactId))) latestQueue.set(String(item.contactId), item);
    const replyByContact = new Map<string, any>();
    for (const item of replies) if (!replyByContact.has(String(item.contactId))) replyByContact.set(String(item.contactId), item);

    const enriched = candidates.map((contact) => {
      const id = String(contact._id);
      const contactSends = latestSends.has(id) ? [latestSends.get(id)] : [];
      const contactQueue = latestQueue.has(id) ? [latestQueue.get(id)] : [];
      const contactReplies = replyByContact.has(id) ? [replyByContact.get(id)] : [];
      return { ...contact, contactStatus: deriveStatus(id, contactSends, contactQueue, contactReplies), latestSend: latestSends.get(id) ?? null, latestQueue: latestQueue.get(id) ?? null, latestReply: replyByContact.get(id) ?? null };
    });
    const allowed = ["all", "sent", "failed", "sending", "queued", "unknown", "not_sent", "reply_received"];
    if (!allowed.includes(status)) return NextResponse.json({ error: "Invalid contact status filter." }, { status: 400 });
    const filtered = status === "all" ? enriched : enriched.filter((contact) => contact.contactStatus === status);
    const total = filtered.length;
    const contacts = filtered.slice((page - 1) * limit, page * limit);
    return NextResponse.json({ view, contacts, counts: Object.fromEntries(["all", "sent", "failed", "sending", "queued", "unknown", "not_sent", "reply_received"].map((key) => [key, key === "all" ? enriched.length : enriched.filter((item) => item.contactStatus === key).length])), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("Failed to fetch contacts overview:", error);
    return NextResponse.json({ error: "Unable to load contacts and delivery status." }, { status: 500 });
  }
}
