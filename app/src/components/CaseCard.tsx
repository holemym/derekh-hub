"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Case } from "@/lib/types";
import PipelineBar from "./PipelineBar";
import TransitLine from "./TransitLine";

/**
 * One case = one card = one next action (PLANNING §2.3, §9).
 * The red accent appears ONLY when the case is truly time-critical — i.e.
 * `critical` (computed by the Today page from isTimeCritical: open work due
 * before candle-lighting, or a manual urgent flag). `critical` defaults to the
 * manual flag so the Cases list still reflects urgency without zmanim context.
 */
export default function CaseCard({
  c,
  index,
  critical,
}: {
  c: Case;
  index: number;
  critical?: boolean;
}) {
  const t = useTranslations();
  const activeLeg = c.transportLegs.find((l) => l.status === "in_transit");
  const hot = critical ?? c.urgent;

  return (
    <article
      className={`rise-in surface relative p-5 ${
        hot ? "border-urgent/50" : ""
      }`}
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
    >
      {/* Whole card opens the case; button sits above the overlay. */}
      <Link
        href={`/cases/${c.id}`}
        className="absolute inset-0 rounded-card"
        aria-label={`${t("cases.openCase")}: ${c.secularName}`}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 dir="rtl" lang="he" className="t-heading truncate text-left font-semibold">
            {c.hebrewName}
          </h3>
          <p className="mt-0.5 truncate t-meta text-muted">{c.secularName}</p>
        </div>

        {hot ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-chip border border-urgent/40 px-2.5 py-1 t-meta font-medium text-urgent">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-urgent" />
            {t("common.urgent")}
          </span>
        ) : (
          <span className="shrink-0 rounded-chip border border-line px-2.5 py-1 t-meta text-muted">
            {t(`stages.${c.status}`)}
          </span>
        )}
      </div>

      {hot && c.urgencyNote ? (
        <p className="mt-2 t-meta font-medium text-urgent">{c.urgencyNote}</p>
      ) : null}

      {/* The ONE next action — "do the next thing". */}
      <p
        className={`mt-3 t-meta font-medium ${hot ? "text-urgent" : "text-ink"}`}
      >
        {t(`actions.${c.status}`)}
      </p>

      <div className="mt-4">
        <PipelineBar stage={c.status} />
      </div>

      {activeLeg ? (
        <div className="mt-4 rounded-xl border border-line px-3 py-2.5">
          <TransitLine leg={activeLeg} />
        </div>
      ) : null}
    </article>
  );
}
