"use client";

/**
 * Case pipeline controls (ROADMAP M3). Replaces the M1 console.log stubs with
 * a real, persisted stage transition:
 *
 *   • The primary "next action" button (from planning: actions.<status>) sits
 *     alongside a primary "Advance to <next stage>" button that moves the case
 *     one step forward via the advanceCaseStage server action (RLS-scoped).
 *   • Once the case is 'buried' there is nothing left to advance — a quiet
 *     "Buried" completed chip is shown instead.
 *
 * All privileged work is in the server action; this only collects the intent
 * and reflects the result (error surfaced inline, router.refresh on success).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Case, PipelineStage } from "@/lib/types";
import { PIPELINE_STAGES, stageIndex } from "@/lib/types";
import { advanceCaseStage } from "@/app/cases/[id]/actions";
import { IconCheck, IconChevronRight } from "@/components/icons";

/** The immediate next stage after `status`, or null if already buried. */
function nextStage(status: PipelineStage): PipelineStage | null {
  const i = stageIndex(status);
  return i >= 0 && i < PIPELINE_STAGES.length - 1
    ? PIPELINE_STAGES[i + 1]
    : null;
}

export default function CaseActions({ c }: { c: Case }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const next = nextStage(c.status);

  function advance(to: PipelineStage) {
    setError(null);
    startTransition(async () => {
      const res = await advanceCaseStage(c.id, to);
      if (!res.ok) {
        setError(res.error ?? t("caseDetail.advanceError"));
        return;
      }
      router.refresh();
    });
  }

  // Buried — the pipeline is complete. Show a quiet completed state, no action.
  if (!next) {
    return (
      <div className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-medium text-muted">
        <IconCheck size={16} />
        {t("caseDetail.completed")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2.5">
        {/* Next action (from the planning brain — reads the current stage). */}
        <span
          className={`flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 text-center text-sm font-semibold ${
            c.urgent ? "bg-urgent text-white" : "bg-ink text-bg"
          }`}
        >
          {t(`actions.${c.status}`)}
        </span>

        {/* Advance one stage forward — the real, persisted transition. */}
        <button
          type="button"
          onClick={() => advance(next)}
          disabled={pending}
          className="pressable flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-xl border border-line px-4 text-sm font-medium text-ink disabled:opacity-60"
        >
          {pending
            ? t("caseDetail.advancing")
            : t("caseDetail.advanceTo", { stage: t(`stages.${next}`) })}
          <IconChevronRight size={16} />
        </button>
      </div>

      {error ? (
        <p className="px-1 text-[13px] font-medium text-urgent">{error}</p>
      ) : null}
    </div>
  );
}
