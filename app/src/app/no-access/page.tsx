import { getTranslations } from "next-intl/server";
import { signOut } from "@/app/auth/actions";
import { IconMore } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * Shown to a user who is signed in but has no active `staff` row — i.e. RLS
 * would let them see nothing. A dead end by design, with a way back to /login
 * to try a different (authorized) account.
 */
export default async function NoAccessPage() {
  const t = await getTranslations("auth");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm rise-in surface p-6 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-line">
          <IconMore size={20} className="text-muted" />
        </span>
        <h1 className="mt-4 t-title">{t("noAccessTitle")}</h1>
        <p className="mt-1.5 t-body text-muted">{t("noAccessBody")}</p>
        <form action={signOut} className="mt-5">
          <button
            type="submit"
            className="pressable flex min-h-11 w-full items-center justify-center rounded-xl border border-line px-4 t-body font-medium text-ink"
          >
            {t("signOutTryAnother")}
          </button>
        </form>
      </div>
    </div>
  );
}
