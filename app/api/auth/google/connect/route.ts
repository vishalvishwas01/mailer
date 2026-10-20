import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { getGoogleAuthorizationUrl } from "@/lib/google-oauth";

export async function GET(request: NextRequest) {
  const requestedEmail = request.nextUrl.searchParams
    .get("email")
    ?.trim()
    .toLowerCase();

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!requestedEmail || !emailPattern.test(requestedEmail)) {
    return NextResponse.json(
      { error: "Provide a valid email using the email query parameter." },
      { status: 400 }
    );
  }

  const state = randomBytes(32).toString("hex");
  const stateHash = createHash("sha256")
    .update(state)
    .digest("hex");

  const response = NextResponse.redirect(
    getGoogleAuthorizationUrl(state)
  );

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60,
  };

  response.cookies.set("google_oauth_state", stateHash, cookieOptions);
  response.cookies.set(
    "google_oauth_requested_email",
    requestedEmail,
    cookieOptions
  );

  return response;
}