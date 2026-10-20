
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";

import { connectDB } from "@/lib/mongodb";
import { extractResumeText } from "@/lib/resume-text";
import openai from "@/lib/openai";
import CampaignDraft from "@/models/CampaignDraft";
import Contact from "@/models/Contact";
import EmailTemplate from "@/models/EmailTemplate";
import EmailDraft from "@/models/EmailDraft";
import AiPromptSettings, { DEFAULT_EMAIL_INSTRUCTIONS } from "@/models/AiPromptSettings";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const requestSchema = z.object({
  contactId: z.string().refine(mongoose.isValidObjectId, {
    message: "Invalid contact ID.",
  }),
});

const generatedEmailSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
});

const allowedPlaceholders = new Set([
  "name",
  "email",
  "company",
  "website",
]);

function renderTemplate(
  template: string,
  values: Record<string, string>
) {
  const rendered = template.replace(
    /\{\{\s*([^{}]+?)\s*\}\}/g,
    (match, key: string) => {
      const placeholder = key.trim();

      if (!allowedPlaceholders.has(placeholder)) {
        throw new Error(`Unsupported placeholder: ${match}`);
      }

      return values[placeholder] ?? "";
    }
  );

  if (/\{\{|\}\}/.test(rendered)) {
    throw new Error("Template contains unresolved placeholders.");
  }

  return rendered;
}

export async function POST(
  request: Request,
  { params }: RouteContext
) {
  try {
    await connectDB();

    const { id } = await params;

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { error: "Invalid campaign draft ID." },
        { status: 400 }
      );
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 }
      );
    }

    const parsedRequest = requestSchema.safeParse(payload);

    if (!parsedRequest.success) {
      return NextResponse.json(
        { error: "A valid contactId is required." },
        { status: 400 }
      );
    }

    const { contactId } = parsedRequest.data;

    const campaign = await CampaignDraft.findById(id).lean();

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign draft not found." },
        { status: 404 }
      );
    }

    const contact = await Contact.findById(contactId)
      .select("name email company website")
      .lean();

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found." },
        { status: 404 }
      );
    }

    const template = await EmailTemplate.findById(
      campaign.templateId
    ).lean();

    if (!template) {
      return NextResponse.json(
        { error: "Campaign template not found." },
        { status: 404 }
      );
    }

    const existingDraft = await EmailDraft.findOne({
      campaignDraftId: campaign._id,
      contactId: contact._id,
    }).lean();

    if (existingDraft) {
      return NextResponse.json(
        {
          error:
            "An email draft already exists for this contact in this campaign.",
          draftId: existingDraft._id,
          status: existingDraft.status,
        },
        { status: 409 }
      );
    }

    const values: Record<string, string> = {
      name: contact.name ?? "",
      email: contact.email,
      company: contact.company ?? "",
      website: contact.website ?? "",
    };

    let templateSubject: string;
    let templateBody: string;

    try {
      templateSubject = renderTemplate(template.subject, values);
      templateBody = renderTemplate(template.body, values);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid email template.",
        },
        { status: 400 }
      );
    }

    // Extract text from the resume associated with this campaign.
    let resumeContext: {
      originalName: string;
      text: string;
    };

    try {
      resumeContext = await extractResumeText(
        campaign.resumeId.toString()
      );
    } catch (error) {
      console.error(
        "Resume text extraction failed:",
        error instanceof Error ? error.message : "Unknown error"
      );

      return NextResponse.json(
        {
          error:
            "Unable to read the campaign resume. Please verify that the uploaded PDF or DOCX is readable.",
        },
        { status: 422 }
      );
    }

    const modelName =
      process.env.OPENAI_MODEL || "gpt-4.1-mini";

    const promptSettings = await AiPromptSettings.findOne({ key: "default" }).lean();
    const emailInstructions =
      promptSettings?.emailInstructions?.trim() || DEFAULT_EMAIL_INSTRUCTIONS;

    let generated: z.infer<typeof generatedEmailSchema>;

    try {
      const response = await openai.responses.create({
        model: modelName,
        instructions: emailInstructions,
        input: JSON.stringify({
          contact: {
            name: contact.name ?? "",
            email: contact.email,
            company: contact.company ?? "",
            website: contact.website ?? "",
          },
          resume: {
            filename: resumeContext.originalName,
            text: resumeContext.text,
          },
          template: {
            subject: templateSubject,
            body: templateBody,
          },
        }),
        text: {
          format: { type: "json_object" },
        },
        max_output_tokens: 1000,
      });

      if (!response.output_text) {
        throw new Error("OpenAI returned an empty response.");
      }

      const parsedOutput: unknown = JSON.parse(
        response.output_text
      );

      generated = generatedEmailSchema.parse(parsedOutput);
    } catch {
      return NextResponse.json(
        {
          error:
            "Unable to generate a valid email. Please try again later.",
        },
        { status: 502 }
      );
    }

    const savedDraft = await EmailDraft.create({
      campaignDraftId: campaign._id,
      contactId: contact._id,
      subject: generated.subject,
      body: generated.body,
      status: "pending_review",
      modelName,
    });

    return NextResponse.json(
      {
        message: "Email draft generated and saved for review.",
        draft: {
          id: savedDraft._id,
          campaignDraftId: savedDraft.campaignDraftId,
          contactId: savedDraft.contactId,
          subject: savedDraft.subject,
          body: savedDraft.body,
          status: savedDraft.status,
          modelName: savedDraft.modelName,
          createdAt: savedDraft.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        {
          error:
            "An email draft already exists for this contact in this campaign.",
        },
        { status: 409 }
      );
    }

    console.error("Generate email draft failed.");

    return NextResponse.json(
      { error: "Unable to generate email draft." },
      { status: 500 }
    );
  }
}
