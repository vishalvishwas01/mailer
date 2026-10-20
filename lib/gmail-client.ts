import "server-only";

import { google } from "googleapis";
import { connectDB } from "@/lib/mongodb";
import { createGoogleOAuthClient } from "@/lib/google-oauth";
import { decryptToken } from "@/lib/token-encryption";
import GmailAccount from "@/models/GmailAccount";
import MailerSettings from "@/models/MailerSettings";

const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export async function getAuthenticatedGmailClient() {
  await connectDB();

  // Find the currently selected Gmail account.
  const settings = await MailerSettings.findOne({ key: "default" });

  if (!settings?.activeGmailAccountId) {
    throw new Error("No active Gmail account is configured.");
  }

  // Load encrypted credentials only on the server.
  const account = await GmailAccount.findById(
    settings.activeGmailAccountId
  ).select("+refreshTokenEncrypted +accessTokenEncrypted");

  if (!account || account.status !== "connected") {
    throw new Error("The active Gmail account is not connected.");
  }

  // Confirm that the account has the required Gmail permissions.
  const missingScopes = REQUIRED_SCOPES.filter(
    (scope) => !account.scopes.includes(scope)
  );

  if (missingScopes.length > 0) {
    throw new Error(
      "The active Gmail account is missing required permissions. Reconnect it with the required Gmail permissions."
    );
  }

  if (!account.refreshTokenEncrypted) {
    throw new Error("The active Gmail account has no refresh token.");
  }

  const oauthClient = createGoogleOAuthClient();

  const refreshToken = decryptToken(account.refreshTokenEncrypted);

  const accessToken = account.accessTokenEncrypted
    ? decryptToken(account.accessTokenEncrypted)
    : undefined;

  oauthClient.setCredentials({
    refresh_token: refreshToken,
    ...(accessToken ? { access_token: accessToken } : {}),
    ...(account.accessTokenExpiresAt
      ? { expiry_date: account.accessTokenExpiresAt.getTime() }
      : {}),
  });

  const gmail = google.gmail({
    version: "v1",
    auth: oauthClient,
  });

  return {
    gmail,
    account: {
      id: account._id.toString(),
      email: account.email,
    },
  };
}