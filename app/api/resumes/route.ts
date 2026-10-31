import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Resume from "@/models/Resume";

export async function GET() {
  try {
    await connectDB();
    const resumes = await Resume.find()
      .select("originalName mimeType size createdAt")
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    return NextResponse.json({ resumes });
  } catch (error) {
    console.error("List resumes failed:", error);
    return NextResponse.json({ error: "Unable to retrieve resumes." }, { status: 500 });
  }
}
