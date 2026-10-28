import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { LlmOutputError, SlidingWindowLimiter, type LlmClient, type ServerEnv } from "@sieveline/core";
import { generateText, Output } from "ai";

/**
 * LLM adapter over any OpenAI-compatible API (OpenAI, Groq, Nebius Token Factory, OpenRouter,
 * Together, local servers...). Provider is chosen with D4; only env vars change.
 * Some free tiers need no key (anonymous), so only the base URL and model are required.
 * LLM_MAX_RPM spaces requests to stay under the provider's per-minute limit instead of hitting 429s.
 * Returns null when not configured, so research still runs (without question answering).
 */
export function createLlm(env: ServerEnv, fetchImpl?: typeof fetch): LlmClient | null {
  if (!env.LLM_BASE_URL || !env.LLM_MODEL_SCORING) return null;
  const limiter = env.LLM_MAX_RPM > 0 ? new SlidingWindowLimiter(env.LLM_MAX_RPM, 60_000) : null;
  const provider = createOpenAICompatible({
    name: env.LLM_PROVIDER ?? "llm",
    baseURL: env.LLM_BASE_URL,
    ...(env.LLM_API_KEY ? { apiKey: env.LLM_API_KEY } : {}),
    supportsStructuredOutputs: env.LLM_STRUCTURED_OUTPUTS,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  const modelFor = (task: string) =>
    provider.chatModel(task === "chat" ? (env.LLM_MODEL_CHAT ?? env.LLM_MODEL_SCORING!) : env.LLM_MODEL_SCORING!);

  return {
    async json({ schema, system, prompt, task, maxOutputTokens }) {
      let result;
      await limiter?.acquire();
      try {
        result = await generateText({
          model: modelFor(task),
          output: Output.object({ schema }),
          system,
          prompt,
          temperature: 0,
          maxOutputTokens: maxOutputTokens ?? 1500,
          maxRetries: 2,
          abortSignal: AbortSignal.timeout(90_000),
        });
      } catch (e) {
        // Name and a short reason only (provider messages can be long; never include the prompt).
        throw new LlmOutputError(e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 160) : "LLM call failed");
      }
      const input = result.usage.inputTokens ?? 0;
      const output = result.usage.outputTokens ?? 0;
      const costUsd = (input * env.LLM_PRICE_INPUT_PER_MTOK + output * env.LLM_PRICE_OUTPUT_PER_MTOK) / 1_000_000;
      return { value: result.output, costUsd };
    },
  };
}
