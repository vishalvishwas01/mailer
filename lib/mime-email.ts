import { randomUUID } from "node:crypto";

export function createRawEmail({
  from,
  to,
  subject,
  body,
  attachment,
}: {
  from: string;
  to: string;
  subject: string;
  body: string;
  attachment: { filename: string; mimeType: string; content: Buffer };
}) {
  const safeHeader = (value: string) => {
    if (/[\r\n]/.test(value)) throw new Error("Invalid line break in email header.");
    return value;
  };
  const safeFilename = attachment.filename.replace(/["\\\r\n]/g, "_");
  const boundary = `mailer_${randomUUID().replace(/-/g, "")}`;
  const encodedSubject = Buffer.from(safeHeader(subject), "utf8").toString("base64");
  const encodedBody = Buffer.from(body.replace(/\r?\n/g, "\r\n"), "utf8")
    .toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  const encodedAttachment = attachment.content.toString("base64")
    .match(/.{1,76}/g)?.join("\r\n") ?? "";

  const mimeMessage = [
    `From: ${safeHeader(from)}`,
    `To: ${safeHeader(to)}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodedBody,
    `--${boundary}`,
    `Content-Type: ${attachment.mimeType}; name="${safeFilename}"`,
    `Content-Disposition: attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
    "Content-Transfer-Encoding: base64",
    "",
    encodedAttachment,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return Buffer.from(mimeMessage, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
