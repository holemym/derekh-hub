"use client";

/**
 * Client wrapper for a single forward-jump target inside the PipelineStepper.
 * Only future stages are interactive (forward-only, mirroring the server-side
 * rule). Clicking a stage ahead jumps the case straight to it — with a confirm,
 * since it skips the stages in between — via the same advanceCaseStage action.
 *
 * Done + current stages render as plain markup (passed as children) so the
 * stepper stays a mostly-static server component; only the jump targets ship JS.
 */

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PipelineStage } from "@/lib/types";
import { advanceCaseStage } from "@/app/cases/[id]/actions";

export default function PipelineStageButton({
  caseId,
  stage,
  stageLabel,
  children,
}: {
  caseId: string;
  stage: PipelineStage;
  stageLabel: string;
  children: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onJump() {
    if (!window.confirm(t("caseDetail.jumpConfirm", { stage: stageLabel }))) {
      return;
    }
    startTransition(async () => {
      const res = await advanceCaseStage(caseId, stage);
      if (!res.ok) {
        window.alert(res.error ?? t("caseDetail.advanceError"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onJump}
      disabled={pending}
      aria-label={t("caseDetail.jumpTo", { stage: stageLabel })}
      className="pressable -mx-2 flex w-full items-start gap-3 rounded-lg px-2 text-left disabled:opacity-60"
    >
      {children}
    </button>
  );
}
