"use client";

/**
 * Per-case money (ROADMAP M4). Shows the roll-up (invoiced / paid / outstanding
 * / expenses / net), the case's invoices (add; advance draft→sent→paid or void;
 * generate the invoice PDF) and its expenses (add: label, amount, date).
 *
 * All privileged work happens in server actions (@/app/cases/[id]/money/
 * actions) under the RLS-scoped staff session; this component only collects
 * input and reflects results.
 */

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { Invoice, Expense, MoneySummary, InvoiceStatus } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import {
  addInvoice,
  advanceInvoice,
  voidInvoice,
  addExpense,
  generateInvoicePdf,
  suggestInvoiceNumber,
} from "@/app/cases/[id]/money/actions";
import { IconPlus, IconDoc, IconCheck } from "@/components/icons";

const INVOICE_NEXT: Record<"draft" | "sent", InvoiceStatus> = {
  draft: "sent",
  sent: "paid",
};

const STATUS_TONE: Record<InvoiceStatus, string> = {
  draft: "border-line text-muted",
  sent: "border-ink text-ink",
  paid: "border-line text-muted",
  void: "border-line text-muted line-through",
};

function base64ToBlobUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

export default function CaseMoney({
  caseId,
  invoices,
  expenses,
  summary,
}: {
  caseId: string;
  invoices: Invoice[];
  expenses: Expense[];
  summary: MoneySummary;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingInvoice, setAddingInvoice] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [suggestedNo, setSuggestedNo] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const money = (cents: number) => formatMoney(cents, locale);

  useEffect(() => {
    if (addingInvoice && !suggestedNo) {
      suggestInvoiceNumber().then((r) => setSuggestedNo(r.number));
    }
  }, [addingInvoice, suggestedNo]);

  function onAddInvoice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("caseId", caseId);
    startTransition(async () => {
      const res = await addInvoice(fd);
      if (!res.ok) {
        setError(res.error ?? t("money.errorInvoice"));
        return;
      }
      setAddingInvoice(false);
      setSuggestedNo("");
      router.refresh();
    });
  }

  function onAddExpense(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("caseId", caseId);
    startTransition(async () => {
      const res = await addExpense(fd);
      if (!res.ok) {
        setError(res.error ?? t("money.errorExpense"));
        return;
      }
      setAddingExpense(false);
      router.refresh();
    });
  }

  function onAdvance(inv: Invoice) {
    setError(null);
    setBusyId(inv.id);
    startTransition(async () => {
      const res = await advanceInvoice({ caseId, invoiceId: inv.id });
      setBusyId(null);
      if (!res.ok) {
        setError(res.error ?? t("money.errorInvoice"));
        return;
      }
      router.refresh();
    });
  }

  function onVoid(inv: Invoice) {
    if (!window.confirm(t("money.confirmVoid"))) return;
    setError(null);
    setBusyId(inv.id);
    startTransition(async () => {
      const res = await voidInvoice({ caseId, invoiceId: inv.id });
      setBusyId(null);
      if (!res.ok) {
        setError(res.error ?? t("money.errorInvoice"));
        return;
      }
      router.refresh();
    });
  }

  async function onGenerate(inv: Invoice) {
    setError(null);
    setGeneratingId(inv.id);
    try {
      const res = await generateInvoicePdf({ caseId, invoiceId: inv.id });
      if (!res.ok || !res.base64) {
        setError(res.error ?? t("money.errorGenerate"));
        return;
      }
      const url = base64ToBlobUrl(res.base64);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName ?? "invoice.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      router.refresh();
    } finally {
      setGeneratingId(null);
    }
  }

  const totals: Array<[string, number, boolean]> = [
    [t("money.totals.invoiced"), summary.invoicedCents, false],
    [t("money.totals.paid"), summary.paidCents, false],
    [t("money.totals.outstanding"), summary.outstandingCents, summary.outstandingCents > 0],
    [t("money.totals.expenses"), summary.expensesCents, false],
    [t("money.totals.net"), summary.netCents, false],
  ];

  const field =
    "min-h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink";

  return (
    <div className="flex flex-col gap-4">
      {/* Roll-up */}
      <dl className="surface grid grid-cols-2 gap-x-4 px-4 py-1 sm:grid-cols-3">
        {totals.map(([label, cents, urgent], i) => (
          <div
            key={label}
            className={`flex flex-col gap-0.5 py-3 ${
              i > 1 ? "border-t border-line sm:border-t-0" : ""
            } ${i > 0 ? "" : ""}`}
          >
            <dt className="t-label">{label}</dt>
            <dd className={`t-heading font-semibold ${urgent ? "text-urgent" : "text-ink"}`}>
              {money(cents)}
            </dd>
          </div>
        ))}
      </dl>

      {/* Invoices */}
      <section className="flex flex-col gap-2.5">
        <h3 className="t-label px-1">{t("money.invoices")}</h3>
        {invoices.length > 0 ? (
          <div className="overflow-hidden rounded-card border border-line bg-card">
            {invoices.map((inv, i) => (
              <div
                key={inv.id}
                className={`px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate t-body font-semibold">
                      {inv.number || t("money.noNumber")}
                    </span>
                    {inv.issuedAt ? (
                      <span className="mt-0.5 block t-meta text-muted">
                        {inv.status === "paid" && inv.paidAt
                          ? `${t("money.paidOn")} ${formatDate(inv.paidAt, locale)}`
                          : `${t("money.issued")} ${formatDate(inv.issuedAt, locale)}`}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="t-body font-semibold tabular-nums">
                      {money(inv.amountCents)}
                    </span>
                    <span
                      className={`rounded-chip border px-2 py-0.5 t-label ${STATUS_TONE[inv.status]}`}
                    >
                      {t(`money.status.${inv.status}`)}
                    </span>
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {inv.status === "draft" || inv.status === "sent" ? (
                    <button
                      type="button"
                      onClick={() => onAdvance(inv)}
                      disabled={busyId === inv.id || pending}
                      className="pressable flex min-h-9 items-center gap-1 rounded-xl bg-ink px-3 text-[13px] font-semibold text-bg disabled:opacity-60"
                    >
                      <IconCheck size={14} />
                      {t(`money.advanceTo.${INVOICE_NEXT[inv.status]}`)}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onGenerate(inv)}
                    disabled={generatingId === inv.id}
                    className="pressable flex min-h-9 items-center gap-1 rounded-xl border border-line px-3 text-[13px] font-medium text-ink disabled:opacity-60"
                  >
                    <IconDoc size={14} />
                    {generatingId === inv.id ? t("money.generating") : t("money.generateInvoice")}
                  </button>
                  {inv.status !== "paid" && inv.status !== "void" ? (
                    <button
                      type="button"
                      onClick={() => onVoid(inv)}
                      disabled={busyId === inv.id || pending}
                      className="pressable min-h-9 rounded-xl border border-line px-3 text-[13px] font-medium text-muted disabled:opacity-50"
                    >
                      {t("money.void")}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {addingInvoice ? (
          <form
            onSubmit={onAddInvoice}
            className="rounded-card border border-line bg-card px-4 py-3.5"
          >
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1 block t-label">{t("money.field.number")}</span>
                <input
                  name="number"
                  defaultValue={suggestedNo}
                  placeholder="INV-2026-0001"
                  className={field}
                />
              </label>
              <label>
                <span className="mb-1 block t-label">{t("money.field.amount")}</span>
                <input
                  name="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  className={field}
                />
              </label>
              <label>
                <span className="mb-1 block t-label">{t("money.field.status")}</span>
                <select name="status" defaultValue="draft" className={field}>
                  <option value="draft">{t("money.status.draft")}</option>
                  <option value="sent">{t("money.status.sent")}</option>
                  <option value="paid">{t("money.status.paid")}</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <button
                type="submit"
                disabled={pending}
                className="pressable flex min-h-10 items-center gap-1 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg disabled:opacity-60"
              >
                {pending ? t("money.saving") : t("money.save")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingInvoice(false);
                  setSuggestedNo("");
                }}
                className="pressable min-h-10 rounded-xl border border-line px-3 text-[13px] font-medium text-muted"
              >
                {t("money.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingInvoice(true)}
            className="pressable flex min-h-11 items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-card px-4 text-sm font-medium text-muted"
          >
            <IconPlus size={16} />
            {t("money.addInvoice")}
          </button>
        )}
      </section>

      {/* Expenses */}
      <section className="flex flex-col gap-2.5">
        <h3 className="t-label px-1">{t("money.expenses")}</h3>
        {expenses.length > 0 ? (
          <div className="overflow-hidden rounded-card border border-line bg-card">
            {expenses.map((ex, i) => (
              <div
                key={ex.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{ex.label}</span>
                  {ex.incurredAt ? (
                    <span className="mt-0.5 block t-meta text-muted">
                      {formatDate(ex.incurredAt, locale)}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 t-body font-medium tabular-nums text-muted">
                  {money(ex.amountCents)}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {addingExpense ? (
          <form
            onSubmit={onAddExpense}
            className="rounded-card border border-line bg-card px-4 py-3.5"
          >
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1 block t-label">{t("money.field.label")}</span>
                <input
                  name="label"
                  placeholder={t("money.field.labelPlaceholder")}
                  className={field}
                />
              </label>
              <label>
                <span className="mb-1 block t-label">{t("money.field.amount")}</span>
                <input
                  name="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  className={field}
                />
              </label>
              <label>
                <span className="mb-1 block t-label">{t("money.field.date")}</span>
                <input type="date" name="incurredAt" className={field} />
              </label>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <button
                type="submit"
                disabled={pending}
                className="pressable flex min-h-10 items-center gap-1 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg disabled:opacity-60"
              >
                {pending ? t("money.saving") : t("money.save")}
              </button>
              <button
                type="button"
                onClick={() => setAddingExpense(false)}
                className="pressable min-h-10 rounded-xl border border-line px-3 text-[13px] font-medium text-muted"
              >
                {t("money.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingExpense(true)}
            className="pressable flex min-h-11 items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-card px-4 text-sm font-medium text-muted"
          >
            <IconPlus size={16} />
            {t("money.addExpense")}
          </button>
        )}
      </section>

      {error ? (
        <p className="px-1 text-[13px] font-medium text-urgent">{error}</p>
      ) : null}
    </div>
  );
}
