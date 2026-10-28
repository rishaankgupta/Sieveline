import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**", "**/.next/**", "**/coverage/**", "**/dist/**", ".tmp/**",
      "**/next-env.d.ts", "packages/db/migrations/**", "**/.workflow-data/**", "**/.workflow-vitest/**", "**/.swc/**", "apps/web/src/app/.well-known/workflow/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },
  {
    // Command-line scripts print their results.
    files: ["**/scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
);
