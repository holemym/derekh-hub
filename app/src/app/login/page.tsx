"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabase/client";
import { IconCheck, IconDoc } from "@/components/icons";

/**
 * Magic-link sign-in. Monoline, matches the app's tokens (bg / card / line /
 * ink / muted). One field, one action. On submit we ask Supabase to email an
 * OTP link that lands on /auth/callback (carrying the `next` param through).
 */
function LoginForm() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const next = params.get("next");
  const urlError = params.get("error");

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      if (next && next.startsWith("/")) callback.searchParams.set("next", next);
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: value,
        options: { emailRedirectTo: callback.toString() },
      });
      if (otpError) throw otpError;
      setSent(true);
    } catch (err) {
      setError((err as Error).message || t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Wordmark */}
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-card">
            <IconDoc size={18} className="text-ink" />
          </span>
          <div className="leading-tight">
            <p className="text-[17px] font-semibold tracking-tight">
              {t("appName")}
            </p>
            <p className="text-xs text-muted">{t("tagline")}</p>
          </div>
        </div>

        {sent ? (
          <div className="rise-in rounded-card border border-line bg-card p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line">
              <IconCheck size={18} className="text-ink" />
            </span>
            <h1 className="mt-3 text-lg font-semibold tracking-tight">
              {t("checkEmailTitle")}
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {t("checkEmailBody", { email: email.trim() })}
            </p>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setError(null);
              }}
              className="pressable mt-4 text-[13px] font-medium text-muted underline underline-offset-4"
            >
              {t("useDifferentEmail")}
            </button>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="rise-in rounded-card border border-line bg-card p-5"
          >
            <h1 className="text-lg font-semibold tracking-tight">
              {t("signInTitle")}
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {t("signInBody")}
            </p>

            <label
              htmlFor="email"
              className="mt-4 block text-[13px] font-medium text-muted"
            >
              {t("emailLabel")}
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-bg px-3.5 text-base text-ink outline-none placeholder:text-muted focus:border-ink"
            />

            {error || urlError ? (
              <p className="mt-3 text-[13px] font-medium text-urgent">
                {error ?? urlError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="pressable mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-ink px-4 text-sm font-semibold text-bg disabled:opacity-60"
            >
              {busy ? t("sending") : t("sendLink")}
            </button>
          </form>
        )}

        <p className="mt-5 px-1 text-xs leading-relaxed text-muted">
          {t("footnote")}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
