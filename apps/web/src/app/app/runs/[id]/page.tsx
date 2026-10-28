import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRun } from "@sieveline/db";
import { app } from "@/server/context";
import { requireWorkspace } from "@/server/session";
import { RunView } from "./run-view";

export const metadata: Metadata = { title: "List" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ws = await requireWorkspace();
  const run = await getRun(app().db, ws, id);
  if (!run) notFound();
  const name = (run.thesisSnapshot as { name?: string }).name ?? "List";
  return <RunView runId={id} name={name} advisorEnabled={Boolean(app().llm) && ws.role !== "viewer"} />;
}
