"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "@/app/auth/actions";

/** Sign-out control for the More screen. Calls the server action. */
export default function SignOutButton() {
  const t = useTranslations("auth");
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => void signOut())}
      className="pressable flex min-h-11 w-full items-center justify-center rounded-xl border border-line px-4 text-sm font-medium text-ink disabled:opacity-60"
    >
      {pending ? t("signingOut") : t("signOut")}
    </button>
  );
}
