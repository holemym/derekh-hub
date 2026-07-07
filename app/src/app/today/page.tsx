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
 * The signature screen (PLANNING §9): one scroll — Shabbos pressure first, the
 * "due soon" tasks, then every open case needing action, sorted by real urgency
 * (ROADMAP M2). Runs on LIVE data via the RLS-scoped repo.
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

  const nothingToDo = cases.length === 0 && dueSoon.length === 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("today.title")}
        </h1>

        {showCountdown && win ? (
          <span
            className={`flex items-center gap-1.5 rounded-chip border px-3 py-1.5 text-[13px] font-medium ${
              critical
                ? "border-urgent/40 text-urgent"
                : "border-line bg-card text-ink"
            }`}
          >
            <IconCandles size={15} />
            {t("today.shabbosIn", {
              hours: win.hoursWhole,
              minutes: win.minutes,
            })}
            <span className={critical ? "text-urgent/70" : "text-muted"}>
              · {formatWeekdayTime(win.candleLighting, locale)}
            </span>
          </span>
        ) : (
          <span
            dir="rtl"
            lang="he"
            className="rounded-chip border border-line bg-card px-3 py-1.5 text-[13px] font-medium"
          >
            {hebrewDate(now).he}
          </span>
        )}
      </div>

      {nothingToDo ? (
        <div className="rounded-card border border-line bg-card px-5 py-16 text-center">
          <p className="text-sm font-medium">{t("today.allQuietTitle")}</p>
          <p className="mx-auto mt-1.5 max-w-[38ch] text-[13px] leading-relaxed text-muted">
            {t("today.allQuietBody")}
          </p>
          <Link
            href="/cases/new"
            className="pressable mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg"
          >
            <IconPlus size={16} />
            {t("today.newPermit")}
          </Link>
        </div>
      ) : (
        <>
          {/* Due soon — overdue / today / before candle-lighting tasks. */}
          {dueSoon.length > 0 ? (
            <section className="mb-6">
              <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
                {t("tasks.dueSoon")}
              </h2>
              <DueSoonTasks tasks={dueSoon} />
            </section>
          ) : null}

          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {t("today.openCases", { count: cases.length })}
            </p>
            <Link
              href="/cases/new"
              className="pressable flex min-h-10 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg"
            >
              <IconPlus size={16} />
              {t("today.newPermit")}
            </Link>
          </div>

          {cases.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
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
        </>
      )}
    </div>
  );
}
