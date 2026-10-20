
import { NextResponse } from "next/server";
import Papa from "papaparse";
import { z } from "zod";

import { connectDB } from "@/lib/mongodb";
import Contact from "@/models/Contact";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_ROWS = 5000;
const MAX_ERROR_DETAILS = 20;

const ContactRowSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  website: z.string().trim().max(2048).optional(),
});

type ContactRow = z.infer<typeof ContactRowSchema>;

function normalizeHeader(header: string): string {
  const key = header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const aliases: Record<string, string> = {
    emailaddress: "email",
    emailid: "email",
    mail: "email",
    fullname: "name",
    firstname: "name",
    companyname: "company",
    organization: "company",
    companywebsite: "website",
    websiteurl: "website",
    url: "website",
  };

  return aliases[key] ?? key;
}

function cleanOptionalValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Upload a CSV file using the "file" field.' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { error: "Only .csv files are supported." },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "The uploaded CSV file is empty." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "CSV file must not exceed 2 MB." },
        { status: 413 }
      );
    }

    const csvText = (await file.text()).replace(/^\uFEFF/, "");

    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: normalizeHeader,
    });

    if (parsed.errors.length > 0) {
      return NextResponse.json(
        {
          error: "The CSV contains malformed rows or inconsistent columns.",
          details: parsed.errors.slice(0, MAX_ERROR_DETAILS).map((item) => ({
            row: item.row,
            message: item.message,
          })),
        },
        { status: 400 }
      );
    }

    if (!parsed.meta.fields?.includes("email")) {
      return NextResponse.json(
        {
          error:
            'A required email column was not found. Use "email" or "Email Address".',
        },
        { status: 400 }
      );
    }

    const rows = parsed.data;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "The CSV contains no contact rows." },
        { status: 400 }
      );
    }

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `A maximum of ${MAX_ROWS} contact rows is allowed per upload.` },
        { status: 413 }
      );
    }

    const validContacts = new Map<string, ContactRow>();
    const seenEmails = new Set<string>();

    let invalidRows = 0;
    let duplicateRows = 0;

    const invalidDetails: Array<{
      row: number;
      email?: string;
      reason: string;
    }> = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      const rawEmail =
        typeof row.email === "string" ? row.email.trim() : "";

      const result = ContactRowSchema.safeParse({
        email: rawEmail,
        name: cleanOptionalValue(row.name),
        company: cleanOptionalValue(row.company),
        website: cleanOptionalValue(row.website),
      });

      if (!result.success) {
        invalidRows++;

        if (invalidDetails.length < MAX_ERROR_DETAILS) {
          invalidDetails.push({
            row: index + 2,
            email: rawEmail || undefined,
            reason: result.error.issues
              .map((issue) => issue.message)
              .join(", "),
          });
        }

        continue;
      }

      const contact = result.data;
      const email = contact.email;

      if (seenEmails.has(email)) {
        duplicateRows++;
        continue;
      }

      seenEmails.add(email);
      validContacts.set(email, contact);
    }

    await connectDB();

    // Ensure the unique email index exists before importing.
    await Contact.init();

    const contacts = Array.from(validContacts.values());

    if (contacts.length === 0) {
      return NextResponse.json({
        message: "No valid new contacts to import.",
        summary: {
          totalRows: rows.length,
          imported: 0,
          alreadyExists: 0,
          duplicateRows,
          invalidRows,
        },
        invalidDetails,
      });
    }

    const result = await Contact.bulkWrite(
      contacts.map((contact) => ({
        updateOne: {
          filter: { email: contact.email },
          update: {
            $setOnInsert: {
              email: contact.email,
              name: contact.name,
              company: contact.company,
              website: contact.website,
              sourceFile: file.name.slice(0, 255),
            },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );

    const imported = result.upsertedCount;
    const alreadyExists = contacts.length - imported;

    return NextResponse.json({
      message: "CSV processed successfully.",
      summary: {
        totalRows: rows.length,
        imported,
        alreadyExists,
        duplicateRows,
        invalidRows,
      },
      invalidDetails,
    });
  } catch (error) {
    console.error("CSV import failed:", error);

    return NextResponse.json(
      { error: "CSV import failed. Check the server logs for details." },
      { status: 500 }
    );
  }
}
