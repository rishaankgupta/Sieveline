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
      // An effect may return only nothing or a cleanup function. A concise arrow returns its
      // expression, e.g. scrollIntoView()'s Promise in current Chrome, which crashed the run page.
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name=/^use(Layout|Insertion)?Effect$/] > ArrowFunctionExpression[expression=true]",
          message: "Give effect callbacks a block body: they must return nothing or a cleanup function.",
        },
      ],
    },
  },
  {
    // Command-line scripts print their results and run on Node.
    files: ["**/scripts/**/*.ts", "**/scripts/**/*.mjs"],
    languageOptions: {
      // Node globals, plus window/document for callbacks the browser tests run inside the page.
      globals: { process: "readonly", console: "readonly", fetch: "readonly", performance: "readonly", Buffer: "readonly", URL: "readonly", window: "readonly", document: "readonly" },
    },
    rules: { "no-console": "off" },
  },
);
