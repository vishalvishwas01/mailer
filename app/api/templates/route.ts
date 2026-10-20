
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import EmailTemplate from "@/models/EmailTemplate";
import { createTemplateSchema } from "@/lib/template-validation";

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri);
  }
}

export async function GET() {
  try {
    await connectDB();

    const templates = await EmailTemplate.find()
      .sort({ updatedAt: -1, _id: -1 })
      .lean();

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Failed to list templates:", error);

    return NextResponse.json(
      { error: "Failed to retrieve templates." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = createTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid template data.",
          details: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    await connectDB();

    const template = await EmailTemplate.create(parsed.data);

    return NextResponse.json(
      {
        message: "Template created successfully.",
        template,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 }
      );
    }

    console.error("Failed to create template:", error);

    return NextResponse.json(
      { error: "Failed to create template." },
      { status: 500 }
    );
  }
}
