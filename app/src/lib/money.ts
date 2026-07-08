/**
 * Money helpers (ROADMAP M4) — pure, cents-based. All amounts are integer
 * cents; display is EUR (see formatMoney). Kept separate from the repo so both
 * the per-case section and the /money overview compute totals identically.
 */

import type { Invoice, Expense, MoneySummary } from "@/lib/types";

/**
 * Roll up a case's invoices + expenses.
 *   invoiced   = sum of invoices that are 'sent' or 'paid' (actually billed;
 *                drafts and voids don't count).
 *   paid       = sum of 'paid' invoices.
 *   outstanding= invoiced − paid (money still owed to us).
 *   expenses   = sum of all expenses.
 *   net        = paid − expenses (cash net once collected).
 */
export function computeMoneySummary(
  invoices: Invoice[],
  expenses: Expense[],
): MoneySummary {
  let invoicedCents = 0;
  let paidCents = 0;
  for (const inv of invoices) {
    if (inv.status === "sent" || inv.status === "paid") invoicedCents += inv.amountCents;
    if (inv.status === "paid") paidCents += inv.amountCents;
  }
  const expensesCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  return {
    invoicedCents,
    paidCents,
    outstandingCents: invoicedCents - paidCents,
    expensesCents,
    netCents: paidCents - expensesCents,
  };
}

/** cents → "€ 1,234.56" (locale-aware digit grouping; EUR symbol). */
export function formatMoney(cents: number, locale: string, currency = "EUR"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}
