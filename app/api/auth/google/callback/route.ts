import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { google } from "googleapis";

import { connectDB } from "@/lib/mongodb";
import { createGoogleOAuthClient } from "@/lib/google-oauth";
import { encryptToken } from "@/lib/token-encryption";
import GmailAccount from "@/models/GmailAccount";

function redirectToDashboard(
  request: NextRequest,
  status: "connected" | "error",
  reason?: string
) {
  const url = new URL("/", request.url);
  url.searchParams.set("gmail", status);

  if (reason) {
    url.searchParams.set("reason", reason);
  }

  const response = NextResponse.redirect(url);

  for (const cookieName of [
    "google_oauth_state",
    "google_oauth_requested_email",
  ]) {
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    const oauthError = searchParams.get("error");
    const savedStateHash = request.cookies.get(
      "google_oauth_state"
    )?.value;

    const requestedEmail = request.cookies
      .get("google_oauth_requested_email")
      ?.value.trim()
      .toLowerCase();

    if (oauthError) {
      return redirectToDashboard(
        request,
        "error",
        "consent_denied"
      );
    }

    if (!code || !state || !savedStateHash || !requestedEmail) {
      return redirectToDashboard(
        request,
        "error",
        "invalid_callback"
      );
    }

    const receivedStateHash = createHash("sha256")
      .update(state)
      .digest("hex");

    const receivedBuffer = Buffer.from(receivedStateHash, "hex");
    const savedBuffer = Buffer.from(savedStateHash, "hex");

    if (
      receivedBuffer.length !== savedBuffer.length ||
      !timingSafeEqual(receivedBuffer, savedBuffer)
    ) {
      return redirectToDashboard(
        request,
        "error",
        "invalid_state"
      );
    }

    const oauthClient = createGoogleOAuthClient();
    const { tokens } = await oauthClient.getToken(code);

    oauthClient.setCredentials(tokens);

    const oauth2 = google.oauth2({
      version: "v2",
      auth: oauthClient,
    });

    const { data: profile } = await oauth2.userinfo.get();

    const verifiedEmail = profile.email?.trim().toLowerCase();

    if (
      !verifiedEmail ||
      profile.verified_email !== true ||
      !profile.id
    ) {
      return redirectToDashboard(
        request,
        "error",
        "account_not_verified"
      );
    }

    // The Google account must match the dashboard's requested email.
    if (verifiedEmail !== requestedEmail) {
      return redirectToDashboard(
        request,
        "error",
        "email_mismatch"
      );
    }

    await connectDB();

    const existingAccount = await GmailAccount.findOne({
      email: verifiedEmail,
    }).select("+refreshTokenEncrypted +accessTokenEncrypted");

    const refreshTokenEncrypted = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : existingAccount?.refreshTokenEncrypted;

    if (!refreshTokenEncrypted) {
      return redirectToDashboard(
        request,
        "error",
        "missing_refresh_token"
      );
    }

    const update: Record<string, unknown> = {
      googleId: profile.id,
      refreshTokenEncrypted,
      scopes: tokens.scope
        ? tokens.scope.split(" ")
        : existingAccount?.scopes ?? [],
      status: "connected",
      connectedAt: new Date(),
    };

    if (tokens.access_token) {
      update.accessTokenEncrypted = encryptToken(
        tokens.access_token
      );
    }

    if (tokens.expiry_date) {
      update.accessTokenExpiresAt = new Date(
        tokens.expiry_date
      );
    }

    await GmailAccount.findOneAndUpdate(
      { email: verifiedEmail },
      { $set: update },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return redirectToDashboard(request, "connected");
  } catch (error) {
    console.error("Google OAuth callback failed:", error);

    return redirectToDashboard(
      request,
      "error",
      "connection_failed"
    );
  }
}