
import { z } from "zod";

const allowedPlaceholders = new Set([
  "name",
  "email",
  "company",
  "website",
]);

const templateFields = {
  name: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
};

const templateObjectSchema = z.object(templateFields).strict();

function validatePlaceholders(
  template: { subject?: string; body?: string },
  ctx: z.RefinementCtx
) {
  const content = `${template.subject ?? ""}\n${template.body ?? ""}`;
  const matches = content.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g);

  for (const match of matches) {
    const placeholder = match[1].trim();

    if (!allowedPlaceholders.has(placeholder)) {
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: `Unsupported placeholder: {{${placeholder}}}. Use name, email, company, or website.`,
      });
    }
  }

  const remaining = content.replace(/\{\{[^{}]*\}\}/g, "");

  if (remaining.includes("{{") || remaining.includes("}}")) {
    ctx.addIssue({
      code: "custom",
      path: ["body"],
      message: "Template contains malformed placeholder syntax.",
    });
  }
}

export const createTemplateSchema = templateObjectSchema.superRefine(
  validatePlaceholders
);

export const updateTemplateSchema = templateObjectSchema
  .partial()
  .superRefine(validatePlaceholders);
