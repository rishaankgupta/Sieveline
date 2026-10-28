"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useAdminAction } from "../admin-client";

export function TestButton({ name }: { name: "database" | "tavily" | "llm" }) {
  const run = useAdminAction();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; ms: number; detail: string } | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button variant="secondary" className="h-8 px-3 text-xs" loading={busy} onClick={async () => {
        setBusy(true);
        try {
          setResult(await run("/api/admin/integrations", { method: "POST", body: { name } }));
        } catch (e) {
          setResult({ ok: false, ms: 0, detail: e instanceof Error ? e.message : "failed" });
        } finally {
          setBusy(false);
        }
      }}>Test connection</Button>
      {result && (
        <span role="status" className={`text-xs ${result.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-400"}`}>
          {result.ok ? "✓ Working" : "✕ Failed"} · {result.ms} ms · {result.detail}
        </span>
      )}
    </span>
  );
}
