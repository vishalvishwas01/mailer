
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import EmailTemplate from "@/models/EmailTemplate";
import { updateTemplateSchema } from "@/lib/template-validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri);
  }
}

async function getTemplateId(context: RouteContext) {
  const { id } = await context.params;

  if (!mongoose.isValidObjectId(id)) {
    return null;
  }

  return id;
}

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const id = await getTemplateId(context);

    if (!id) {
      return NextResponse.json(
        { error: "Invalid template ID." },
        { status: 400 }
      );
    }

    await connectDB();

    const template = await EmailTemplate.findById(id).lean();

    if (!template) {
      return NextResponse.json(
        { error: "Template not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("Failed to retrieve template:", error);

    return NextResponse.json(
      { error: "Failed to retrieve template." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const id = await getTemplateId(context);

    if (!id) {
      return NextResponse.json(
        { error: "Invalid template ID." },
        { status: 400 }
      );
    }

    const body: unknown = await request.json();
    const parsed = updateTemplateSchema.safeParse(body);

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

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { error: "Provide at least one field to update." },
        { status: 400 }
      );
    }

    await connectDB();

    const template = await EmailTemplate.findByIdAndUpdate(
      id,
      { $set: parsed.data },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!template) {
      return NextResponse.json(
        { error: "Template not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Template updated successfully.",
      template,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 }
      );
    }

    console.error("Failed to update template:", error);

    return NextResponse.json(
      { error: "Failed to update template." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext
) {
  try {
    const id = await getTemplateId(context);

    if (!id) {
      return NextResponse.json(
        { error: "Invalid template ID." },
        { status: 400 }
      );
    }

    await connectDB();

    const template = await EmailTemplate.findByIdAndDelete(id);

    if (!template) {
      return NextResponse.json(
        { error: "Template not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Template deleted successfully.",
      id,
    });
  } catch (error) {
    console.error("Failed to delete template:", error);

    return NextResponse.json(
      { error: "Failed to delete template." },
      { status: 500 }
    );
  }
}
