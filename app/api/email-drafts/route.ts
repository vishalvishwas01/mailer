
import { NextResponse } from "next/server";
import { z } from "zod";

import { connectDB } from "@/lib/mongodb";
import EmailDraft from "@/models/EmailDraft";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum([
    "pending_review",
    "approved",
    "rejected",
  ]).optional(),
});

export async function GET(request: Request) {
  try {
    await connectDB();

    const url = new URL(request.url);

    const parsed = querySchema.safeParse({
      page: url.searchParams.get("page") ?? "1",
      limit: url.searchParams.get("limit") ?? "20",
      status: url.searchParams.get("status") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid pagination or status parameters." },
        { status: 400 }
      );
    }

    const { page, limit, status } = parsed.data;
    const filter = status ? { status } : {};

    const [drafts, total] = await Promise.all([
      EmailDraft.find(filter)
        .populate("contactId", "name email company website")
        .populate("campaignDraftId", "name")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      EmailDraft.countDocuments(filter),
    ]);

    return NextResponse.json({
      drafts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch {
    console.error("List email drafts failed.");

    return NextResponse.json(
      { error: "Unable to retrieve email drafts." },
      { status: 500 }
    );
  }
}
