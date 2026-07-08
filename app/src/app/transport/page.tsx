import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { listTransportLegs, type TransportLegWithCase } from "@/lib/repo";
import type { TransportLegStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import { IconPlane, IconChevronRight } from "@/components/icons";

export const dynamic = "force-dynamic";

/** Board sections, in dispatch priority order. */
const GROUPS: { status: TransportLegStatus }[] = [
  { status: "in_transit" },
  { status: "booked" },
  { status: "planned" },
  { status: "completed" },
];

/** Ground/air chip tone — one accent only; nothing colored but in_transit ink. */
const STATUS_TONE: Record<TransportLegStatus, string> = {
  planned: "border-line text-muted",
  booked: "border-line text-ink",
  in_transit: "border-ink text-ink",
  completed: "border-line text-muted",
};

function legTypeKey(t: TransportLegWithCase["leg"]["type"]): string {
  return t === "domestic" ? "domestic_il" : t;
}

/**
 * Transport dispatch board (ROADMAP M3). Every active leg across all cases,
 * grouped by status — In transit / Booked / Planned / recently Completed — each
 * row showing the niftar, route, carrier and scheduled time, linking to the
 * case.
 */
export default async function TransportPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const all = await listTransportLegs();

  // Completed can pile up — show only the recent ones on the board.
  const completed = all
    .filter((x) => x.leg.status === "completed")
    .slice(-8)
    .reverse();

  const grouped = new Map<TransportLegStatus, TransportLegWithCase[]>();
  for (const g of GROUPS) grouped.set(g.status, []);
  for (const x of all) {
    if (x.leg.status === "completed") continue;
    grouped.get(x.leg.status)?.push(x);
  }
  grouped.set("completed", completed);

  const active = all.filter((x) => x.leg.status !== "completed").length;
  const sections = GROUPS.map((g) => ({
    status: g.status,
    rows: grouped.get(g.status) ?? [],
  })).filter((s) => s.rows.length > 0);

  return (
    <div>
      <h1 className="mb-1 t-display lg:hidden">{t("transportPage.title")}</h1>
      <p className="mb-6 t-meta text-muted lg:mt-1">
        {t("transportPage.subtitle", { count: active })}
      </p>

      {sections.length === 0 ? (
        <div className="mx-auto max-w-[720px]">
          <EmptyState
            icon={<IconPlane size={26} />}
            title={t("transportPage.emptyTitle")}
            body={t("transportPage.emptyBody")}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map(({ status, rows }) => (
            <section key={status}>
              <h2 className="t-label mb-2 flex items-baseline gap-2 px-1">
                {t(`transport.status.${status}`)}
                <span className="font-normal normal-case tracking-normal">
                  {rows.length}
                </span>
              </h2>
              <div className="surface divide-y divide-line overflow-hidden">
                {rows.map(({ leg, caseId, hebrewName, secularName, urgent }) => (
                  <Link
                    key={leg.id}
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
                          {hebrewName || secularName || t("transportPage.unnamed")}
                        </span>
                        {urgent ? (
                          <span className="pulse-dot h-1.5 w-1.5 shrink-0 rounded-full bg-urgent" />
                        ) : null}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate t-meta text-muted">
                        <span className="font-medium text-ink">{leg.from || "—"}</span>
                        <IconPlane size={13} className="shrink-0" />
                        <span className="font-medium text-ink">{leg.to || "—"}</span>
                        <span>· {t(`transport.types.${legTypeKey(leg.type)}`)}</span>
                        {leg.carrier ? <span>· {leg.carrier}</span> : null}
                      </p>
                      {leg.scheduledAt ? (
                        <p className="mt-0.5 truncate t-meta text-muted">
                          {formatDateTime(leg.scheduledAt, locale)}
                          {leg.flightNo ? ` · ${leg.flightNo}` : ""}
                          {leg.awbNo ? ` · AWB ${leg.awbNo}` : ""}
                        </p>
                      ) : null}
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-chip border px-2 py-0.5 t-label ${STATUS_TONE[leg.status]}`}
                      >
                        {t(`transport.status.${leg.status}`)}
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
