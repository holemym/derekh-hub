import { getLocale, getTranslations } from "next-intl/server";
import { openCasesByUrgency, listOpenTasks } from "@/lib/repo";
import { hebrewDate } from "@/lib/zmanim";
import { shabbosCountdown, isTimeCritical, dueSoonTasks } from "@/lib/planning";
import { formatWeekdayTime } from "@/lib/format";
import Link from "next/link";
import CaseCard from "@/components/CaseCard";
import DueSoonTasks from "@/components/DueSoonTasks";
import { IconCandles, IconPlus } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * The signature screen (DESIGN.md): one calm scroll on mobile — Shabbos
 * pressure, "due soon" tasks, then every open case needing action, sorted by
 * real urgency. On desktop it becomes main-column (cases) + right rail
 * (before-Shabbos, due-soon, counts). LIVE data via the RLS-scoped repo.
 */
export default async function TodayPage() {
  const t = await getTranslations();
  const locale = await getLocale();

  const now = new Date();
  const win = shabbosCountdown(now);
  const [cases, openTasks] = await Promise.all([
    openCasesByUrgency(now),
    listOpenTasks(),
  ]);
  const dueSoon = dueSoonTasks(openTasks, now);

  const showCountdown = win !== null && win.withinWindow;
  // Red only when the window is truly closing (erev, ≤12h).
  const critical = win !== null && win.hoursUntil <= 12;
  const urgentCount = cases.filter((c) => isTimeCritical(c, now)).length;

  const nothingToDo = cases.length === 0 && dueSoon.length === 0;

  const shabbosChip =
    showCountdown && win ? (
      <span
        className={`flex items-center gap-1.5 rounded-chip border px-3 py-1.5 t-meta font-medium ${
          critical
            ? "border-urgent/40 text-urgent"
            : "border-line bg-card text-ink"
        }`}
      >
        <IconCandles size={15} />
        {t("today.shabbosIn", { hours: win.hoursWhole, minutes: win.minutes })}
        <span className={critical ? "text-urgent/70" : "text-muted"}>
          · {formatWeekdayTime(win.candleLighting, locale)}
        </span>
      </span>
    ) : (
      <span
        dir="rtl"
        lang="he"
        className="rounded-chip border border-line bg-card px-3 py-1.5 t-meta font-medium"
      >
        {hebrewDate(now).he}
      </span>
    );

  return (
    <div>
      {/* Page heading — hidden on desktop where the Topbar carries the title. */}
      <div className="mb-5 flex items-center justify-between gap-3 lg:hidden">
        <h1 className="t-display">{t("today.title")}</h1>
        {shabbosChip}
      </div>

      {nothingToDo ? (
        <div className="surface px-5 py-16 text-center">
          <p className="t-heading">{t("today.allQuietTitle")}</p>
          <p className="mx-auto mt-2 max-w-[42ch] t-meta text-muted">
            {t("today.allQuietBody")}
          </p>
          <Link
            href="/cases/new"
            className="pressable mt-6 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-[14px] font-semibold text-bg"
          >
            <IconPlus size={16} />
            {t("today.newPermit")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main column — open cases needing action. */}
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="t-meta text-muted">
                {t("today.openCases", { count: cases.length })}
              </p>
              <Link
                href="/cases/new"
                className="pressable flex min-h-10 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg lg:hidden"
              >
                <IconPlus size={16} />
                {t("today.newPermit")}
              </Link>
            </div>

            {/* Due soon — mobile only in-flow; desktop shows it in the rail. */}
            {dueSoon.length > 0 ? (
              <section className="mb-6 lg:hidden">
                <h2 className="t-label mb-2 px-1">{t("tasks.dueSoon")}</h2>
                <DueSoonTasks tasks={dueSoon} />
              </section>
            ) : null}

            {cases.length === 0 ? (
              <p className="py-10 text-center t-meta text-muted">
                {t("today.noCases")}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {cases.map((c, i) => (
                  <CaseCard
                    key={c.id}
                    c={c}
                    index={i}
                    critical={isTimeCritical(c, now)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right rail — desktop only: Shabbos, due-soon, counts. */}
          <aside className="hidden lg:flex lg:flex-col lg:gap-6">
            <div className="surface p-5">
              <h2 className="t-label mb-3">{t("today.title")}</h2>
              {shabbosChip}
              <dl className="mt-4 space-y-2">
                <div className="flex items-baseline justify-between">
                  <dt className="t-meta text-muted">
                    {t("today.openCasesLabel")}
                  </dt>
                  <dd className="t-heading tabular-nums">{cases.length}</dd>
                </div>
                {urgentCount > 0 ? (
                  <div className="flex items-baseline justify-between">
                    <dt className="t-meta text-urgent">{t("common.urgent")}</dt>
                    <dd className="t-heading tabular-nums text-urgent">
                      {urgentCount}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>

            {dueSoon.length > 0 ? (
              <section>
                <h2 className="t-label mb-2 px-1">{t("tasks.dueSoon")}</h2>
                <DueSoonTasks tasks={dueSoon} />
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
