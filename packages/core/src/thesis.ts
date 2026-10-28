import { z } from "zod";

/** One yes/no question a company is checked against. */
export const criterionSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,39}$/, "Use lowercase letters, numbers and underscores"),
  question: z.string().trim().min(10).max(300),
  weight: z.number().min(0).max(10).default(1),
  required: z.boolean().default(false),
});

const domainLike = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, "Must be a domain like example.com");

/** A buyer's acquisition thesis. Stored as validated JSON. */
export const thesisSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().min(20).max(2000),
    country: z.string().trim().min(2).max(60).default("united states"),
    places: z.array(z.string().trim().min(2).max(80)).max(60).default([]),
    minYearsInBusiness: z.number().int().min(0).max(200).nullable().default(null),
    criteria: z.array(criterionSchema).min(1).max(12),
    excludeIfMentions: z.array(z.string().trim().min(2).max(120)).max(100).default([]),
    excludeDomains: z.array(domainLike).max(150).default([]),
    shortlistSize: z.number().int().min(3).max(25).default(10),
    strongFitScore: z.number().min(0).max(100).default(6),
  })
  .superRefine((t, ctx) => {
    const ids = new Set<string>();
    for (const [i, c] of t.criteria.entries()) {
      if (ids.has(c.id)) {
        ctx.addIssue({ code: "custom", path: ["criteria", i, "id"], message: "Duplicate id" });
      }
      ids.add(c.id);
    }
  });

export type Criterion = z.infer<typeof criterionSchema>;
export type Thesis = z.infer<typeof thesisSchema>;
export type ThesisInput = z.input<typeof thesisSchema>;

export function parseThesis(input: unknown): Thesis {
  return thesisSchema.parse(input);
}
