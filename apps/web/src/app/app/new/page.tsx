import type { Metadata } from "next";
import calibration from "../../../../../../packages/core/templates/calibration-labs-us.json" with { type: "json" };
import { app } from "@/server/context";
import { ThesisBuilder } from "./thesis-builder";

export const metadata: Metadata = { title: "New list" };
export const dynamic = "force-dynamic";

export default function NewListPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">New list</h1>
      <p className="mt-1 text-[var(--color-muted)]">Describe what you want to buy. You&apos;ll check the rules and the cost before anything runs.</p>
      <ThesisBuilder templates={[{ id: "calibration", name: "Independent calibration labs (US)", thesis: calibration }]} draftingEnabled={Boolean(app().llm)} />
    </div>
  );
}
