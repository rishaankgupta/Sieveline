import { FatalError, getStepMetadata } from "workflow";

/**
 * M1-T09 spike: proves the patterns the research pipeline needs (ADR-0004):
 * batches run in parallel as separate steps, a transient failure is retried only for that
 * batch, and a budget stop ends the run without retries. Not used in production.
 */
export async function batchSpike(items: string[], batchSize: number, budget: number) {
  "use workflow";
  const batches: string[][] = [];
  for (let i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize));
  const results = await Promise.all(batches.map((b, i) => processBatch(b, i, budget)));
  return { batches: results.length, processed: results.flat() };
}

async function processBatch(batch: string[], index: number, budget: number) {
  "use step";
  const { attempt } = getStepMetadata();
  if (batch.length > budget) throw new FatalError(`batch ${index} exceeds budget`);
  // Simulate one flaky upstream call: batch 1 fails on its first attempt only.
  if (index === 1 && attempt === 1) throw new Error("transient upstream error");
  return batch.map((x) => `${x}:attempt${attempt}`);
}
