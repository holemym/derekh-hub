import { getLocale, getTranslations } from "next-intl/server";
import IntakeForm from "@/components/IntakeForm";

export const dynamic = "force-dynamic";

/**
 * PUBLIC family-intake page (no login) — the family-facing data-collection point
 * that replaces the standalone tool's JSON-file handoff. It writes straight to
 * `intake_submissions` under anon RLS (see intake/actions.ts). Rendered WITHOUT
 * the staff app chrome (AppChrome hides Header/TabNav on /intake) and outside the
 * auth gate (/intake is in PUBLIC_PATHS).
 */
export default async function IntakePage() {
  const t = await getTranslations("intake");
  const locale = await getLocale();

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[680px] px-4 pb-24 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </header>

      <p className="mb-5 rounded-card border border-line bg-card p-4 text-[14px] leading-relaxed text-ink/90">
        {t("lead")}
      </p>

      <IntakeForm locale={locale} />
    </div>
  );
}
