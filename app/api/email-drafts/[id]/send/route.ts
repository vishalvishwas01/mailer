import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { getAuthenticatedGmailClient } from "@/lib/gmail-client";
import EmailDraft from "@/models/EmailDraft";
import EmailSend from "@/models/EmailSend";
import Contact from "@/models/Contact";
import CampaignDraft from "@/models/CampaignDraft";
import Resume from "@/models/Resume";
import EmailTemplate from "@/models/EmailTemplate";
import { readResumeFile } from "@/lib/gridfs";
import { createRawEmail } from "@/lib/mime-email";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  _request: NextRequest,
  { params }: RouteContext
) {
  let sendRecordId: mongoose.Types.ObjectId | undefined;

  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid email draft ID." },
        { status: 400 }
      );
    }

    await connectDB();

    const emailDraft = await EmailDraft.findById(id);

    if (!emailDraft) {
      return NextResponse.json(
        { error: "Email draft not found." },
        { status: 404 }
      );
    }

    if (emailDraft.status !== "approved") {
      return NextResponse.json(
        {
          error:
            "Only approved email drafts can be sent. Approve this draft first.",
        },
        { status: 409 }
      );
    }

    const contact = await Contact.findById(emailDraft.contactId);

    if (!contact) {
      return NextResponse.json(
        { error: "Recipient contact not found." },
        { status: 404 }
      );
    }

    if (!contact.email) {
      return NextResponse.json(
        { error: "The recipient does not have an email address." },
        { status: 422 }
      );
    }

    const campaign = await CampaignDraft.findById(emailDraft.campaignDraftId).lean();
    const resume = campaign ? await Resume.findById(campaign.resumeId).lean() : null;
    if (!resume) {
      return NextResponse.json({ error: "The campaign resume is missing. Upload or select a resume before sending." }, { status: 409 });
    }

    const template = campaign ? await EmailTemplate.findById(campaign.templateId).lean() : null;
    const templateAttachment = template?.attachment;
    const templateAttachmentBuffer = templateAttachment ? await readResumeFile(templateAttachment.fileId) : null;

    let resumeBuffer: Buffer;
    try {
      resumeBuffer = await readResumeFile(resume.fileId);
      if (!resumeBuffer.length || resumeBuffer.length > 5 * 1024 * 1024) {
        throw new Error("Resume attachment is empty or exceeds 5 MB.");
      }
    } catch (error) {
      console.error("Unable to load resume for manual email:", error);
      return NextResponse.json({ error: "Unable to read the campaign resume. Email was not sent." }, { status: 500 });
    }

    const { gmail, account } = await getAuthenticatedGmailClient();

    // Create the record before contacting Gmail. Unique indexes
    // prevent concurrent requests from creating duplicate records.
    const sendRecord = await EmailSend.create({
      campaignDraftId: emailDraft.campaignDraftId,
      emailDraftId: emailDraft._id,
      contactId: emailDraft.contactId,
      gmailAccountId: account.id,
      recipientEmail: contact.email,
      senderEmail: account.email,
      status: "sending",
      attemptedAt: new Date(),
    });

    sendRecordId = sendRecord._id;

    try {
      const raw = createRawEmail({
        from: account.email,
        to: contact.email,
        subject: emailDraft.subject,
        body: emailDraft.body,
        attachment: {
          filename: resume.originalName,
          mimeType: resume.mimeType,
          content: resumeBuffer,
        },
        ...(templateAttachment && templateAttachmentBuffer ? { attachments: [{ filename: templateAttachment.originalName, mimeType: templateAttachment.mimeType, content: templateAttachmentBuffer }] } : {}),
      });

      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });

      const messageId = response.data.id;
      const threadId = response.data.threadId;

      if (!messageId) {
        await EmailSend.findByIdAndUpdate(sendRecordId, {
          status: "unknown",
          errorMessage:
            "Gmail returned no message ID. Verify the Gmail Sent folder before taking further action.",
        });

        return NextResponse.json(
          {
            error:
              "The send result could not be confirmed. Check Gmail Sent before attempting another send.",
          },
          { status: 502 }
        );
      }

      await EmailSend.findByIdAndUpdate(sendRecordId, {
        status: "sent",
        gmailMessageId: messageId,
        ...(threadId ? { gmailThreadId: threadId } : {}),
        sentAt: new Date(),
        $unset: { errorMessage: 1 },
      });

      return NextResponse.json(
        {
          message: "Email sent successfully.",
          send: {
            id: sendRecordId.toString(),
            senderEmail: account.email,
            recipientEmail: contact.email,
            status: "sent",
            gmailMessageId: messageId,
            gmailThreadId: threadId ?? null,
          },
        },
        { status: 200 }
      );
    } catch {
      // A network error may happen after Gmail has accepted the email.
      // Mark the result unknown instead of automatically retrying.
      await EmailSend.findByIdAndUpdate(sendRecordId, {
        status: "unknown",
        errorMessage:
          "Gmail's response could not be confirmed. Check the Gmail Sent folder before taking further action.",
      });

      return NextResponse.json(
        {
          error:
            "The send result is uncertain. Check Gmail Sent before attempting another send.",
          status: "unknown",
        },
        { status: 502 }
      );
    }
  } catch (error: unknown) {
    // MongoDB duplicate-key errors indicate a send record already exists.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        {
          error:
            "A send record already exists for this draft or campaign recipient. Check the send history before doing anything else.",
        },
        { status: 409 }
      );
    }

    console.error("Manual email send failed:", error);

    return NextResponse.json(
      { error: "Unable to process the send request." },
      { status: 500 }
    );
  }
}
