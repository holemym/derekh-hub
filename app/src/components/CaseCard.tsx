"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Case } from "@/lib/types";
import PipelineBar from "./PipelineBar";
import TransitLine from "./TransitLine";

/**
 * One case = one card = one next action (PLANNING §2.3, §9).
 * Red styling appears ONLY when the case is truly time-critical.
 */
export default function CaseCard({ c, index }: { c: Case; index: number }) {
  const t = useTranslations();
  const activeLeg = c.transportLegs.find((l) => l.status === "in_transit");

  return (
    <article
      className={`rise-in relative rounded-card border bg-card p-4 ${
        c.urgent ? "border-urgent/50" : "border-line"
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
          <h3 dir="rtl" lang="he" className="truncate text-left text-[17px] font-semibold">
            {c.hebrewName}
          </h3>
          <p className="mt-0.5 truncate text-sm text-muted">{c.secularName}</p>
        </div>

        {c.urgent ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-chip border border-urgent/40 px-2.5 py-1 text-xs font-medium text-urgent">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-urgent" />
            {t("common.urgent")}
          </span>
        ) : (
          <span className="shrink-0 rounded-chip border border-line px-2.5 py-1 text-xs text-muted">
            {t(`stages.${c.status}`)}
          </span>
        )}
      </div>

      {c.urgent && c.urgencyNote ? (
        <p className="mt-2 text-[13px] font-medium text-urgent">
          {c.urgencyNote}
        </p>
      ) : null}

      <div className="mt-3">
        <PipelineBar stage={c.status} />
      </div>

      {activeLeg ? (
        <div className="mt-3 rounded-xl border border-line px-3 py-2.5">
          <TransitLine leg={activeLeg} />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() =>
          // Stub — wired to real mutations in a later phase.
          console.log("[derech] next action", c.id, c.status)
        }
        className={`pressable relative z-10 mt-3 flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold ${
          c.urgent
            ? "bg-urgent text-white"
            : "border border-ink/80 text-ink"
        }`}
      >
        {t(`actions.${c.status}`)}
      </button>
    </article>
  );
}
