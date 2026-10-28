import { adminCan, integrationStatus } from "@sieveline/core";
import { app } from "@/server/context";
import { PageTitle, pageStaff, Table, Td } from "../ui";
import { TestButton } from "./test-button";

export const dynamic = "force-dynamic";

const ROWS: { key: keyof ReturnType<typeof integrationStatus> | "database"; label: string; vars: string; test?: "database" | "tavily" | "llm" }[] = [
  { key: "database", label: "Database (Neon)", vars: "DATABASE_URL, DATABASE_URL_ADMIN", test: "database" },
  { key: "tavily", label: "Tavily", vars: "TAVILY_API_KEY", test: "tavily" },
  { key: "llm", label: "Language model", vars: "LLM_BASE_URL, LLM_MODEL_SCORING (LLM_API_KEY if the provider needs one)", test: "llm" },
  { key: "email", label: "Email (Resend)", vars: "EMAIL_PROVIDER_API_KEY, EMAIL_FROM" },
  { key: "turnstile", label: "Bot check (Cloudflare Turnstile)", vars: "TURNSTILE_SECRET_KEY, NEXT_PUBLIC_TURNSTILE_SITE_KEY" },
  { key: "googleSignIn", label: "Google sign-in", vars: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET" },
  { key: "errorTracking", label: "Error tracking (Sentry)", vars: "SENTRY_DSN" },
];

export default async function AdminIntegrations() {
  const staff = await pageStaff("admin.view");
  const status = integrationStatus(app().env);
  const canTest = adminCan(staff.role, "integrations.test");
  return (
    <div>
      <PageTitle title="Integrations" sub="Keys live in Vercel's environment variables, never in this panel. This page only shows whether each one is set and answers." />
      <Table head={["Service", "Configured", "Variables", ""]}>
        {ROWS.map((r) => {
          const set = r.key === "database" ? true : status[r.key];
          return (
            <tr key={r.key}>
              <Td className="font-medium">{r.label}</Td>
              <Td>{set ? "✓ Set" : <strong className="text-amber-700 dark:text-amber-400">✕ Not set</strong>}</Td>
              <Td className="font-mono text-xs">{r.vars}</Td>
              <Td>{canTest && r.test && set && <TestButton name={r.test} />}</Td>
            </tr>
          );
        })}
      </Table>
      <p className="mt-3 text-sm text-[var(--color-muted)]">Tests cost nothing: Tavily&apos;s usage endpoint is free and the model test only lists models.</p>
    </div>
  );
}
