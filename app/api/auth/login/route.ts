import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "mailer_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function signSession(expiresAt: number, secret: string) {
  return createHmac("sha256", secret)
    .update(`mailer-session:${expiresAt}`)
    .digest("base64url");
}

export async function POST(request: NextRequest) {
  const configuredPassword = process.env.APP_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!configuredPassword || !sessionSecret || sessionSecret.length < 32) {
    return NextResponse.json(
      { error: "Authentication is not configured. Set APP_PASSWORD and a SESSION_SECRET of at least 32 characters." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const suppliedPassword =
    body && typeof body === "object" && "password" in body &&
    typeof body.password === "string"
      ? body.password
      : "";

  const supplied = Buffer.from(suppliedPassword);
  const expected = Buffer.from(configuredPassword);
  const matches =
    supplied.length === expected.length && timingSafeEqual(supplied, expected);

  if (!matches) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = `${expiresAt}.${signSession(expiresAt, sessionSecret)}`;
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
