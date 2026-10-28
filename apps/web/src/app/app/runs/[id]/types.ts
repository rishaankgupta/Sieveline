export interface Company {
  id: string;
  domain: string;
  name: string | null;
  status: string;
  score: number;
  summary: string | null;
  failedRule: string | null;
  source: string;
}
export interface Fact {
  id: string;
  companyId: string;
  kind: string;
  key: string | null;
  value: string;
  quote: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
}
export interface ShortlistItem {
  companyId: string;
  position: number;
  reason: string;
  pinned: boolean;
  hidden: boolean;
}
export interface Review {
  companyId: string;
  decision: "approved" | "rejected" | "needs_check";
  note: string | null;
}
export interface Rule {
  id: string;
  question: string;
  label: string;
  required: boolean;
}
export interface Results {
  run: { id: string; status: string };
  thesis: { name: string; description: string; criteria: Rule[] };
  companies: Company[];
  facts: Fact[];
  shortlist: ShortlistItem[];
  reviews: Review[];
  canEdit: boolean;
}
export interface RunStatus {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  error: string | null;
  creditsUsed: number;
  steps: { step: string; batch: number; status: string }[];
}
