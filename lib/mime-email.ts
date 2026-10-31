export function createRawEmail({
  from,
  to,
  subject,
  body,
}: {
  from: string;
  to: string;
  subject: string;
  body: string;
}) {
  const safeHeader = (value: string) => {
    if (/[\r\n]/.test(value)) throw new Error("Invalid line break in email header.");
    return value;
  };
  const encodedSubject = Buffer.from(safeHeader(subject), "utf8").toString("base64");
  const encodedBody = Buffer.from(body.replace(/\r?\n/g, "\r\n"), "utf8")
    .toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  const mimeMessage = [
    `From: ${safeHeader(from)}`,
    `To: ${safeHeader(to)}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodedBody,
    "",
  ].join("\r\n");

  return Buffer.from(mimeMessage, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
