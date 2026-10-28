import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/tavily/types.ts"],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
