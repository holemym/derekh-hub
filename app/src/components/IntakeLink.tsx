"use client";

/**
 * Shareable PUBLIC intake link for staff — shows the absolute /intake URL with a
 * copy button, like the standalone tool surfaced it in Settings. Used at the top
 * of the Intake inbox (and reusable in More).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

export default function IntakeLink({ url }: { url: string }) {
  const t = useTranslations("intakeInbox");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the link is visible to copy by hand */
    }
  }

  return (
    <div className="surface mb-6 p-4">
      <p className="t-label">{t("linkTitle")}</p>
      <p className="mt-1.5 t-meta text-muted">{t("linkBody")}</p>
      <div className="mt-2.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl border border-line bg-bg px-3 py-2 text-[13px] text-ink">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          className="pressable min-h-9 shrink-0 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg"
        >
          {copied ? t("copied") : t("copyLink")}
        </button>
      </div>
    </div>
  );
}
