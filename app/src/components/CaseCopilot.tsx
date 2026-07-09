"use client";

/**
 * Case copilot (ROADMAP M5) — two on-demand AI drafts for a case: the
 * consulate email and a hand-over summary. Rendered only when the server says
 * AI is configured (ANTHROPIC_API_KEY present). Nothing runs on page load;
 * nothing is saved — the operator copies / opens mail with the result.
 */

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  aiDraftConsulateEmail,
  aiSummarizeCase,
} from "@/app/cases/[id]/ai/actions";
import { buildMailtoLink } from "@/lib/comms";
import { IconDoc, IconChat } from "@/components/icons";

export default function CaseCopilot({ caseId }: { caseId: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"email" | "summary" | null>(null);
  const [result, setResult] = useState<string>("");
  const [recipient, setRecipient] = useState<string | undefined>();
  const [kind, setKind] = useState<"email" | "summary" | null>(null);
  const [copied, setCopied] = useState(false);

  function run(which: "email" | "summary") {
    setError(null);
    setBusy(which);
    setCopied(false);
    startTransition(async () => {
      const res =
        which === "email"
          ? await aiDraftConsulateEmail({ caseId, locale })
          : await aiSummarizeCase({ caseId, locale });
      setBusy(null);
      if (!res.ok || !res.text) {
        setError(res.error ?? t("copilot.error"));
        return;
      }
      setResult(res.text);
      setKind(which);
      setRecipient(
        which === "email" && "recipientEmail" in res
          ? (res.recipientEmail as string | undefined)
          : undefined,
      );
    });
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
    } catch {
      // Clipboard denied — text stays selectable below.
    }
  }

  // For "Open email": first line "Subject: …" becomes the subject.
  const subjectMatch = result.match(/^Subject:\s*(.+)$/im);
  const mailBody = subjectMatch
    ? result.replace(/^Subject:\s*.+\n?/im, "").trim()
    : result;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => run("email")}
          disabled={pending}
          className="pressable flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 text-[13px] font-medium text-ink disabled:opacity-60"
        >
          <IconChat size={15} />
          {busy === "email" ? t("copilot.drafting") : t("copilot.consulateEmail")}
        </button>
        <button
          type="button"
          onClick={() => run("summary")}
          disabled={pending}
          className="pressable flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 text-[13px] font-medium text-ink disabled:opacity-60"
        >
          <IconDoc size={15} />
          {busy === "summary" ? t("copilot.drafting") : t("copilot.summarize")}
        </button>
      </div>

      {result ? (
        <div className="rounded-card border border-line bg-card px-4 py-3.5">
          <p className="whitespace-pre-wrap t-meta text-ink">{result}</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onCopy}
              className="pressable min-h-9 rounded-xl border border-line px-3 text-[13px] font-medium text-ink"
            >
              {copied ? t("copilot.copied") : t("copilot.copy")}
            </button>
            {kind === "email" ? (
              <a
                href={buildMailtoLink(recipient, subjectMatch?.[1] ?? "", mailBody)}
                className="pressable flex min-h-9 items-center rounded-xl border border-line px-3 text-[13px] font-medium text-ink"
              >
                {t("copilot.openEmail")}
              </a>
            ) : null}
          </div>
          <p className="mt-2 t-meta text-muted">{t("copilot.reviewNote")}</p>
        </div>
      ) : null}

      {error ? (
        <p className="px-1 text-[13px] font-medium text-urgent">{error}</p>
      ) : null}
    </div>
  );
}
