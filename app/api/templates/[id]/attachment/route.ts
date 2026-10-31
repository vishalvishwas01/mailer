import { NextResponse } from "next/server";

// Kept as a compatibility endpoint so outdated clients cannot silently attach
// files after the application moved to shareable resume links.
export async function POST() {
  return NextResponse.json({ error: "File attachments are no longer supported. Add a resume link in AI & Templates." }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: "File attachments are no longer supported." }, { status: 410 });
}
