import type { z } from "zod";

/**
 * The only thing the research pipeline needs from a language model: answer with JSON that
 * matches a schema. The real adapter (any provider, via the AI SDK) is chosen with D4; tests use fakes.
 */
export interface LlmClient {
  json<T>(input: {
    schema: z.ZodType<T>;
    system: string;
    prompt: string;
    /** Logical task name for metering and model routing (e.g. "scoring", "query_plan"). */
    task: "scoring" | "query_plan" | "chat";
    maxOutputTokens?: number;
  }): Promise<{ value: T; costUsd: number }>;
}

export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmOutputError";
  }
}
