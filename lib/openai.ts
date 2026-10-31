
import "server-only";

import OpenAI from "openai";

export type AiProvider = "gemini" | "openai";

export function getAiProvider(): AiProvider {
  const configured = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  if (configured !== "gemini" && configured !== "openai") {
    throw new Error("AI_PROVIDER must be either 'gemini' or 'openai'.");
  }
  return configured;
}

export function getAiModel(provider = getAiProvider()): string {
  return provider === "gemini"
    ? process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"
    : process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

export function getAiClient(provider = getAiProvider()) {
  const apiKey = provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(`${provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} is missing. Add it to .env.local and restart the server.`);
  }
  return new OpenAI({
    apiKey,
    ...(provider === "gemini" ? { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" } : {}),
  });
}
