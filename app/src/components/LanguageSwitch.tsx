"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/i18n/actions";

const OPTIONS = [
  { value: "en", labelKey: "english" },
  { value: "de", labelKey: "german" },
] as const;

/** EN / DE segmented control — writes the locale cookie via server action. */
export default function LanguageSwitch() {
  const locale = useLocale();
  const t = useTranslations("more");
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={t("language")}
      className="flex rounded-xl border border-line p-1"
    >
      {OPTIONS.map((opt) => {
        const active = locale === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => setLocale(opt.value))}
            className={`pressable min-h-11 flex-1 rounded-lg text-sm font-medium ${
              active ? "bg-ink text-bg" : "text-muted"
            } ${pending ? "opacity-60" : ""}`}
          >
            {t(opt.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
