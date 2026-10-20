import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "mailer_session";

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function isValidSession(token: string | undefined, secret: string | undefined) {
  if (!token || !secret || secret.length < 32) return false;
  const [expiresText, signatureText, extra] = token.split(".");
  if (!expiresText || !signatureText || extra !== undefined) return false;
  const expiresAt = Number(expiresText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signatureText),
      new TextEncoder().encode(`mailer-session:${expiresAt}`)
    );
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/login" || pathname === "/api/auth/login") return NextResponse.next();

  // Allow the scheduled Vercel cron only when it supplies the configured secret.
  if (pathname === "/api/email-worker") {
    const cronSecret = process.env.CRON_SECRET;
    const authorization = request.headers.get("authorization");
    if (cronSecret && authorization === `Bearer ${cronSecret}`) return NextResponse.next();
  }

  const valid = await isValidSession(
    request.cookies.get(SESSION_COOKIE)?.value,
    process.env.SESSION_SECRET
  );
  if (valid) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
