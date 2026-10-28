import { describe, expect, it } from "vitest";
import { start } from "workflow/api";
import { batchSpike } from "./spike";

describe("workflow spike (M1-T09)", () => {
  it("runs batches as steps and retries only the failed batch", async () => {
    const run = await start(batchSpike, [["a", "b", "c", "d", "e"], 2, 10]);
    const out = await run.returnValue;
    expect(out.batches).toBe(3);
    expect(out.processed).toEqual(["a:attempt1", "b:attempt1", "c:attempt2", "d:attempt2", "e:attempt1"]);
    expect(await run.status).toBe("completed");
  });

  it("stops without retrying when a step throws FatalError", async () => {
    const run = await start(batchSpike, [["a", "b", "c"], 3, 2]);
    await expect(run.returnValue).rejects.toThrow();
    expect(await run.status).toBe("failed");
  });
});
