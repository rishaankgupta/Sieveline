/**
 * Credit reservation logic, kept pure so it can be tested without a database.
 * The db package persists these numbers inside a transaction with row locks.
 */
export interface BudgetState {
  monthlyCap: number;
  usedThisMonth: number;
  reserved: number;
}

export type ReserveResult =
  | { ok: true; state: BudgetState }
  | { ok: false; reason: "workspace_cap"; available: number };

export function available(state: BudgetState): number {
  return Math.max(0, state.monthlyCap - state.usedThisMonth - state.reserved);
}

export function reserve(state: BudgetState, amount: number): ReserveResult {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("reservation must be a non-negative number");
  const free = available(state);
  if (amount > free) return { ok: false, reason: "workspace_cap", available: free };
  return { ok: true, state: { ...state, reserved: state.reserved + amount } };
}

/** Turns part of a reservation into real usage and releases the rest. */
export function settle(state: BudgetState, reservedAmount: number, actualCredits: number): BudgetState {
  if (reservedAmount < 0 || actualCredits < 0) throw new Error("amounts must be non-negative");
  return {
    ...state,
    reserved: Math.max(0, state.reserved - reservedAmount),
    usedThisMonth: state.usedThisMonth + actualCredits,
  };
}

/** Global safety net across all workspaces. */
export function underDailyCeiling(spentToday: number, next: number, ceiling: number): boolean {
  return spentToday + next <= ceiling;
}

/** True if our ledger and Tavily's usage report differ by more than the tolerance. */
export function ledgerDrift(ours: number, theirs: number, tolerance = 0.05): boolean {
  if (theirs === 0) return ours !== 0;
  return Math.abs(ours - theirs) / theirs > tolerance;
}
