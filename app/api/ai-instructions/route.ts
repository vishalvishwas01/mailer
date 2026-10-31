import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import AiPromptSettings, { DEFAULT_EMAIL_INSTRUCTIONS } from "@/models/AiPromptSettings";
import { getAiProvider } from "@/lib/openai";

const updateSchema = z.object({
  emailInstructions: z.string().trim().min(1).max(20000).optional(),
  aiProvider: z.enum(["gemini", "openai"]).optional(),
}).strict();

export async function GET() {
  try {
    await connectDB();
    const settings = await AiPromptSettings.findOneAndUpdate(
      { key: "default" },
      { $setOnInsert: { key: "default", emailInstructions: DEFAULT_EMAIL_INSTRUCTIONS, aiProvider: getAiProvider() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    if (!settings) throw new Error("AI instructions could not be initialized.");
    return NextResponse.json({
      emailInstructions: settings.emailInstructions,
      aiProvider: settings.aiProvider || getAiProvider(),
    });
  } catch (error) {
    console.error("Load AI instructions failed:", error);
    return NextResponse.json({ error: "Unable to load AI instructions." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success || !parsed.data || Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: "Provide valid instructions or an AI provider." }, { status: 400 });
    }

    await connectDB();
    const settings = await AiPromptSettings.findOneAndUpdate(
      { key: "default" },
      { $set: parsed.data, $setOnInsert: { key: "default" } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    if (!settings) throw new Error("AI instructions could not be saved.");
    return NextResponse.json({
      message: "AI settings saved for future email generations.",
      emailInstructions: settings.emailInstructions,
      aiProvider: settings.aiProvider || getAiProvider(),
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must contain valid JSON." }, { status: 400 });
    }
    console.error("Save AI instructions failed:", error);
    return NextResponse.json({ error: "Unable to save AI instructions." }, { status: 500 });
  }
}
