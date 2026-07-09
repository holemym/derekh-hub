"use client";

/**
 * Today's AI brief (ROADMAP M5) — one tap, one Claude call, one calm summary
 * of what must happen (especially before Shabbos/chag). Rendered only when
 * the server says AI is configured; never runs on page load.
 */

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { aiDailyBrief } from "@/app/today/ai-actions";
import { IconCandles } from "@/components/icons";

export default function DailyBrief() {
  const t = useTranslations();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<string>("");

  function onGenerate() {
    setError(null);
    startTransition(async () => {
      const res = await aiDailyBrief({ locale });
      if (!res.ok || !res.text) {
        setError(res.error ?? t("copilot.error"));
        return;
      }
      setBrief(res.text);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {brief ? (
        <div className="rounded-card border border-line bg-card px-4 py-3.5">
          <p className="whitespace-pre-wrap t-meta text-ink">{brief}</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={onGenerate}
          disabled={pending}
          className="pressable flex min-h-11 items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-card px-4 text-sm font-medium text-muted disabled:opacity-60"
        >
          <IconCandles size={16} />
          {pending ? t("copilot.drafting") : t("copilot.dailyBrief")}
        </button>
      )}
      {error ? (
        <p className="px-1 text-[13px] font-medium text-urgent">{error}</p>
      ) : null}
    </div>
  );
}
