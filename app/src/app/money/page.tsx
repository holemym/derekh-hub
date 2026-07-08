import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { moneyOverview, type InvoiceWithCase } from "@/lib/repo";
import type { InvoiceStatus } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import { IconMoney, IconChevronRight } from "@/components/icons";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<InvoiceStatus, string> = {
  draft: "border-line text-muted",
  sent: "border-ink text-ink",
  paid: "border-line text-muted",
  void: "border-line text-muted line-through",
};

/**
 * Cross-case money overview (ROADMAP M4). Outstanding invoices (sent, unpaid)
 * up top, then paid, then drafts — each row case-linked with the niftar name —
 * plus a totals band (invoiced / paid / outstanding / expenses / net). RLS-
 * scoped: a non-staff caller sees nothing.
 */
export default async function MoneyPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const { invoices, summary } = await moneyOverview();
  const money = (cents: number) => formatMoney(cents, locale);

  const outstanding = invoices
    .filter((x) => x.invoice.status === "sent")
    .sort((a, b) => (a.invoice.issuedAt ?? "").localeCompare(b.invoice.issuedAt ?? ""));
  const paid = invoices
    .filter((x) => x.invoice.status === "paid")
    .sort((a, b) => (b.invoice.paidAt ?? "").localeCompare(a.invoice.paidAt ?? ""));
  const drafts = invoices.filter((x) => x.invoice.status === "draft");

  const sections: Array<{ key: string; rows: InvoiceWithCase[] }> = [
    { key: "outstanding", rows: outstanding },
    { key: "paid", rows: paid },
    { key: "draft", rows: drafts },
  ].filter((s) => s.rows.length > 0);

  const totals: Array<[string, number, boolean]> = [
    [t("money.totals.invoiced"), summary.invoicedCents, false],
    [t("money.totals.paid"), summary.paidCents, false],
    [t("money.totals.outstanding"), summary.outstandingCents, summary.outstandingCents > 0],
    [t("money.totals.expenses"), summary.expensesCents, false],
    [t("money.totals.net"), summary.netCents, false],
  ];

  return (
    <div>
      <h1 className="mb-1 t-display lg:hidden">{t("moneyPage.title")}</h1>
      <p className="mb-6 t-meta text-muted lg:mt-1">
        {t("moneyPage.subtitle", { count: outstanding.length })}
      </p>

      {/* Totals band */}
      <dl className="surface mb-6 grid grid-cols-2 gap-x-4 px-4 py-1 sm:grid-cols-3 lg:grid-cols-5">
        {totals.map(([label, cents, urgent]) => (
          <div key={label} className="flex flex-col gap-0.5 py-3">
            <dt className="t-label">{label}</dt>
            <dd className={`t-heading font-semibold ${urgent ? "text-urgent" : "text-ink"}`}>
              {money(cents)}
            </dd>
          </div>
        ))}
      </dl>

      {sections.length === 0 ? (
        <div className="mx-auto max-w-[720px]">
          <EmptyState
            icon={<IconMoney size={26} />}
            title={t("moneyPage.emptyTitle")}
            body={t("moneyPage.emptyBody")}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map(({ key, rows }) => (
            <section key={key}>
              <h2 className="t-label mb-2 flex items-baseline gap-2 px-1">
                {t(`moneyPage.groups.${key}`)}
                <span className="font-normal normal-case tracking-normal">
                  {rows.length}
                </span>
              </h2>
              <div className="surface divide-y divide-line overflow-hidden">
                {rows.map(({ invoice, caseId, hebrewName, secularName }) => (
                  <Link
                    key={invoice.id}
                    href={`/cases/${caseId}`}
                    className="pressable flex min-h-[64px] items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span
                          dir="rtl"
                          lang="he"
                          className="truncate t-heading text-left font-semibold"
                        >
                          {hebrewName || secularName || t("moneyPage.unnamed")}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate t-meta text-muted">
                        {invoice.number || t("money.noNumber")}
                        {invoice.status === "paid" && invoice.paidAt
                          ? ` · ${t("money.paidOn")} ${formatDate(invoice.paidAt, locale)}`
                          : invoice.issuedAt
                            ? ` · ${t("money.issued")} ${formatDate(invoice.issuedAt, locale)}`
                            : ""}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2.5">
                      <span className="t-body font-semibold tabular-nums">
                        {money(invoice.amountCents)}
                      </span>
                      <span
                        className={`rounded-chip border px-2 py-0.5 t-label ${STATUS_TONE[invoice.status]}`}
                      >
                        {t(`money.status.${invoice.status}`)}
                      </span>
                      <IconChevronRight size={18} className="text-muted" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
