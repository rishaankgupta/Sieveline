import { z } from "zod";

/**
 * Research tuning knobs. Defaults follow docs/01-architecture/TAVILY-STRATEGY.md.
 * Editable from the admin panel (MA-T02); each run stores a snapshot so results are reproducible.
 */
export const researchSettingsSchema = z.object({
  /** Search fan-out */
  maxQueries: z.number().int().min(1).max(60).default(25),
  searchDepth: z.enum(["basic", "advanced"]).default("basic"),
  resultsPerQuery: z.number().int().min(5).max(20).default(20),
  maxCandidates: z.number().int().min(5).max(500).default(120),
  /** Map + targeted extract */
  mapLimit: z.number().int().min(5).max(100).default(30),
  mapInstructions: z.boolean().default(true),
  pagesPerCompany: z.number().int().min(1).max(8).default(4),
  extractBatchSize: z.number().int().min(1).max(20).default(20),
  /** Deep stages, only for the best candidates */
  newsCheckTop: z.number().int().min(0).max(100).default(25),
  crawlTop: z.number().int().min(0).max(50).default(10),
  crawlLimit: z.number().int().min(5).max(100).default(30),
  /** Output */
  shortlistSize: z.number().int().min(3).max(25).default(10),
  cacheTtlDays: z.number().int().min(0).max(90).default(7),
});

export type ResearchSettings = z.infer<typeof researchSettingsSchema>;

export const DEFAULT_RESEARCH_SETTINGS: ResearchSettings = researchSettingsSchema.parse({});

/**
 * An admin override: only the keys the admin set, same limits, no defaults filled in (zod's
 * `.partial()` would still apply every default, freezing today's defaults into the stored row).
 */
export const researchSettingsOverrideSchema = z
  .object(
    Object.fromEntries(
      Object.entries(researchSettingsSchema.shape).map(([k, v]) => [k, v.unwrap().optional()]),
    ) as { [K in keyof typeof researchSettingsSchema.shape]: z.ZodOptional<ReturnType<(typeof researchSettingsSchema.shape)[K]["unwrap"]>> },
  )
  .strict();
export type ResearchSettingsOverride = z.infer<typeof researchSettingsOverrideSchema>;
