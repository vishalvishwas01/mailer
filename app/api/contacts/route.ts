
import { NextResponse } from "next/server";

import { connectDB } from "@/lib/mongodb";
import Contact from "@/models/Contact";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const pageParam = Number(url.searchParams.get("page") ?? "1");
    const limitParam = Number(
      url.searchParams.get("limit") ?? String(DEFAULT_LIMIT)
    );

    if (
      !Number.isInteger(pageParam) ||
      pageParam < 1 ||
      !Number.isInteger(limitParam) ||
      limitParam < 1
    ) {
      return NextResponse.json(
        { error: "Page and limit must be positive integers." },
        { status: 400 }
      );
    }

    const page = pageParam;
    const limit = Math.min(limitParam, MAX_LIMIT);
    const search = (url.searchParams.get("search") ?? "").trim();

    if (search.length > 200) {
      return NextResponse.json(
        { error: "Search must not exceed 200 characters." },
        { status: 400 }
      );
    }

    await connectDB();

    const filter = search
      ? {
          $or: [
            { email: { $regex: escapeRegex(search), $options: "i" } },
            { name: { $regex: escapeRegex(search), $options: "i" } },
            { company: { $regex: escapeRegex(search), $options: "i" } },
          ],
        }
      : {};

    const [contacts, total] = await Promise.all([
      Contact.find(filter)
        .select("email name company website sourceFile createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Contact.countDocuments(filter),
    ]);

    return NextResponse.json({
      contacts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to fetch contacts:", error);

    return NextResponse.json(
      { error: "Failed to fetch contacts." },
      { status: 500 }
    );
  }
}
