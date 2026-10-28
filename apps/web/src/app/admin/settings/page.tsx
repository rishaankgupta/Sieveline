import { adminCan, DEFAULT_RESEARCH_SETTINGS } from "@sieveline/core";
import { adminSettingHistory } from "@sieveline/db";
import { formatDate } from "@/lib/labels";
import { adminDb } from "@/server/admin";
import { PageTitle, pageStaff, Table, Td } from "../ui";
import { KillSwitch, ResearchSettingsEditor, RollbackButton } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  const staff = await pageStaff("settings.view");
  const db = adminDb();
  const [history, paused] = await Promise.all([adminSettingHistory(db, "research_settings", 20), adminSettingHistory(db, "research_paused", 10)]);
  const current = (history.find((h) => h.active)?.value ?? {}) as Record<string, unknown>;
  const isPaused = paused.find((p) => p.active)?.value === true;
  const canEdit = adminCan(staff.role, "settings.edit");
  return (
    <div className="flex flex-col gap-10">
      <PageTitle title="Settings" sub="Changes apply to the next list started. Each list keeps a copy of the settings it ran with." />

      <section aria-labelledby="kill" className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <h2 id="kill" className="text-lg font-semibold">Pause all research</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Stops new lists and deep dives for everyone. Lists already running stop at their next stage and keep what they found.
        </p>
        <p className="mt-3 font-medium">Now: {isPaused ? <span className="text-red-700 dark:text-red-400">paused</span> : "research is on"}</p>
        {adminCan(staff.role, "research.kill_switch") ? <KillSwitch paused={isPaused} /> : <p className="mt-2 text-sm">Only the owner can change this.</p>}
      </section>

      <section aria-labelledby="rs">
        <h2 id="rs" className="text-lg font-semibold">Research settings</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Only the values you set here are stored; anything left out uses the built-in default. Values outside the allowed range are refused.
        </p>
        <ResearchSettingsEditor current={current} defaults={DEFAULT_RESEARCH_SETTINGS} canEdit={canEdit} />
      </section>

      <section aria-labelledby="hist">
        <h2 id="hist" className="mb-2 text-lg font-semibold">History</h2>
        <Table head={["Version", "When", "By", "Note", "Value", ""]} empty={!history.length}>
          {history.map((h, i) => (
            <tr key={h.id}>
              <Td>v{h.version}{i === 0 && " (current)"}</Td>
              <Td className="whitespace-nowrap">{formatDate(h.createdAt)}</Td>
              <Td className="font-mono text-xs">{h.changedBy?.slice(0, 8) ?? "—"}</Td>
              <Td className="text-sm">{h.note ?? ""}</Td>
              <Td><code className="block max-w-md whitespace-pre-wrap break-all text-xs">{JSON.stringify(h.value)}</code></Td>
              <Td>{canEdit && i > 0 && <RollbackButton version={h.version} value={h.value} />}</Td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
