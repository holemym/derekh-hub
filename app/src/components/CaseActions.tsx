"use client";

import { useTranslations } from "next-intl";
import type { Case } from "@/lib/types";

/** Primary next-action + advance-stage stubs on the case detail view. */
export default function CaseActions({ c }: { c: Case }) {
  const t = useTranslations();

  return (
    <div className="flex gap-2.5">
      <button
        type="button"
        onClick={() => console.log("[derech] next action", c.id, c.status)}
        className={`pressable flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold ${
          c.urgent ? "bg-urgent text-white" : "bg-ink text-bg"
        }`}
      >
        {t(`actions.${c.status}`)}
      </button>
      <button
        type="button"
        onClick={() => console.log("[derech] advance stage", c.id, c.status)}
        className="pressable flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-medium text-ink"
      >
        {t("caseDetail.advanceStage")}
      </button>
    </div>
  );
}
