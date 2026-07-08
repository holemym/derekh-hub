import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { casesByStage } from "@/lib/repo";
import { PIPELINE_STAGES } from "@/lib/types";
import { IconChevronRight, IconPlus, IconCases } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * All cases, grouped by pipeline stage (master list). On desktop it widens into
 * a two-pane layout: the grouped list on the left, a summary panel on the right.
 * Selecting a case opens the full detail route (mobile: list → full page).
 */
export default async function CasesPage() {
  const t = await getTranslations();
  const grouped = await casesByStage();

  const stagesWithCases = PIPELINE_STAGES.map((stage) => ({
    stage,
    cases: grouped.get(stage) ?? [],
  })).filter((g) => g.cases.length > 0);

  const total = stagesWithCases.reduce((n, g) => n + g.cases.length, 0);

  return (
    <div>
      {/* Heading — mobile only; desktop uses the Topbar. */}
      <div className="mb-5 flex items-center justify-between gap-3 lg:hidden">
        <h1 className="t-display">{t("cases.title")}</h1>
        <Link
          href="/cases/new"
          className="pressable flex min-h-10 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg"
        >
          <IconPlus size={16} />
          {t("newPermit.new")}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Master list */}
        <div className="min-w-0">
          {stagesWithCases.length === 0 ? (
            <div className="surface px-5 py-16 text-center">
              <div className="mb-3 flex justify-center text-muted">
                <IconCases size={26} />
              </div>
              <p className="t-heading">{t("cases.empty")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {stagesWithCases.map(({ stage, cases }) => (
                <section key={stage}>
                  <h2 className="t-label mb-2 flex items-baseline gap-2 px-1">
                    {t(`stages.${stage}`)}
                    <span className="font-normal normal-case tracking-normal">
                      {cases.length}
                    </span>
                  </h2>
                  <div className="surface divide-y divide-line overflow-hidden">
                    {cases.map((c) => (
                      <Link
                        key={c.id}
                        href={`/cases/${c.id}`}
                        className="pressable flex min-h-[60px] items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p dir="rtl" lang="he" className="t-heading truncate text-left font-semibold">
                            {c.hebrewName}
                          </p>
                          <p className="truncate t-meta text-muted">
                            {c.secularName}
                          </p>
                        </div>
                        <span className="flex shrink-0 items-center gap-2">
                          {c.urgent ? (
                            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-urgent" />
                          ) : null}
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

        {/* Right panel — desktop only: counts by stage. */}
        <aside className="hidden lg:block">
          <div className="surface sticky top-24 p-5">
            <h2 className="t-label mb-3">{t("cases.title")}</h2>
            <p className="t-display tabular-nums">{total}</p>
            <p className="mb-4 t-meta text-muted">
              {t("today.openCasesLabel")}
            </p>
            <dl className="space-y-2 border-t border-line pt-4">
              {stagesWithCases.map(({ stage, cases }) => (
                <div key={stage} className="flex items-baseline justify-between">
                  <dt className="t-meta text-muted">{t(`stages.${stage}`)}</dt>
                  <dd className="t-meta tabular-nums">{cases.length}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
