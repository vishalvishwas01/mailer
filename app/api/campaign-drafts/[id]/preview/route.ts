
import { NextResponse } from "next/server";
import mongoose from "mongoose";

import {connectDB} from "@/lib/mongodb";
import CampaignDraft from "@/models/CampaignDraft";
import Contact from "@/models/Contact";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const allowedPlaceholders = new Set([
  "name",
  "email",
  "company",
  "website",
  "role",
  "sender_name",
]);

function renderTemplate(
  template: string,
  values: Record<string, string>
) {
  return template.replace(
    /\{\{\s*([^{}]+?)\s*\}\}/g,
    (match, key: string) => {
      const placeholder = key.trim();

      if (!allowedPlaceholders.has(placeholder)) {
        throw new Error(`Unsupported placeholder: ${match}`);
      }

      return values[placeholder] ?? match;
    }
  );
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

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("contactId" in payload) ||
      typeof payload.contactId !== "string" ||
      !mongoose.isValidObjectId(payload.contactId)
    ) {
      return NextResponse.json(
        { error: "A valid contactId is required." },
        { status: 400 }
      );
    }

    const draft = await CampaignDraft.findById(id)
      .populate("templateId", "name subject body")
      .lean();

    if (!draft) {
      return NextResponse.json(
        { error: "Campaign draft not found." },
        { status: 404 }
      );
    }

    const contact = await Contact.findById(payload.contactId)
      .select("name email company website")
      .lean();

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found." },
        { status: 404 }
      );
    }

    const template = draft.templateId as unknown as {
      name: string;
      subject: string;
      body: string;
    } | null;

    if (!template) {
      return NextResponse.json(
        { error: "The campaign template is unavailable." },
        { status: 404 }
      );
    }

    const values = {
      name: contact.name ?? "",
      email: contact.email ?? "",
      company: contact.company ?? "",
      website: contact.website ?? "",
    };

    const subject = renderTemplate(template.subject, values);
    const body = renderTemplate(template.body, values);

    if (/\{\{|\}\}/.test(`${subject}\n${body}`)) {
      return NextResponse.json(
        { error: "Template contains unresolved placeholders." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: "Email preview generated successfully.",
      preview: {
        contact: {
          id: contact._id,
          name: contact.name,
          email: contact.email,
          company: contact.company,
        },
        subject,
        body,
        status: "preview_only",
      },
    });
  } catch (error) {
    if (error instanceof Error &&
        error.message.startsWith("Unsupported placeholder:")) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error("Generate email preview failed:", error);

    return NextResponse.json(
      { error: "Unable to generate email preview." },
      { status: 500 }
    );
  }
}
