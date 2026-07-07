import { getTranslations } from "next-intl/server";
import { IconCheckDraw } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * PUBLIC family-intake confirmation (no login). Reached after submitIntake
 * succeeds — the anon client can't read the row back, so we simply reassure the
 * family that their details arrived. No app chrome (AppChrome hides it on
 * /intake) and outside the auth gate (/intake in PUBLIC_PATHS).
 */
export default async function IntakeThanksPage() {
  const t = await getTranslations("intake");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[680px] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-bg">
        <IconCheckDraw size={28} />
      </div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        {t("thanks.title")}
      </h1>
      <p className="max-w-[460px] text-[15px] leading-relaxed text-muted">
        {t("thanks.body")}
      </p>
      <p className="mt-6 text-[13px] text-muted">{t("thanks.closeHint")}</p>
    </div>
  );
}
