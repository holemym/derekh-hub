"use client";

/**
 * PUBLIC family-intake FORM (ROADMAP M1) — the gentle, family-facing screen that
 * replaces the standalone tool's JSON-export handoff. It collects the deceased's
 * basics, the passing, place of burial and document attachments, then posts them
 * to `intake_submissions` via the anon-scoped `submitIntake` server action.
 *
 * Faithful to burial-permit-v2/intake.html's field set + gentle tone, rebuilt in
 * the hub's monoline design (tokens: card/line/ink/muted), mobile-first, EN/DE via
 * next-intl. Input `name`s match submitIntake exactly. Basic bot deterrence via a
 * hidden honeypot (`company`), a time-trap stamp (`startedAt`) and a per-IP throttle server-side.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { submitIntake } from "@/app/intake/actions";
import { IconPlus } from "@/components/icons";

const inputCls =
  "min-h-11 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[15px] text-ink outline-none focus:border-ink";

/** Document slots: single-file except `other` (multiple). */
const DOC_SLOTS = [
  { key: "death", multi: false },
  { key: "id", multi: false },
  { key: "doctor", multi: false },
  { key: "other", multi: true },
] as const;

function Field({
  label,
  required,
  span2,
  children,
}: {
  label: string;
  required?: boolean;
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={span2 ? "sm:col-span-2" : undefined}>
      <label className="mb-1.5 flex items-baseline justify-between gap-2 t-meta font-medium text-ink">
        <span>
          {label}
          {required ? <span className="text-urgent"> *</span> : null}
        </span>
      </label>
      {children}
    </div>
  );
}

export default function IntakeForm({ locale }: { locale: string }) {
  const t = useTranslations("intake");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [natType, setNatType] = useState<"israeli" | "foreigner">("israeli");
  const [busy, setBusy] = useState(false);
  // Time-trap stamp: when the form mounted (bots submit instantly; humans don't).
  const [startedAt] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const el = e.currentTarget;

    // Required: surname, firstname, dod, consent. The browser enforces `required`
    // too, but we double-check to give a gentle single message.
    const fd = new FormData(el);
    const missing =
      !String(fd.get("surname") ?? "").trim() ||
      !String(fd.get("firstname") ?? "").trim() ||
      !String(fd.get("dod") ?? "").trim() ||
      !fd.get("consent");
    if (missing) {
      setError(t("reqMissing"));
      return;
    }

    setBusy(true);
    try {
      const res = await submitIntake(fd);
      if (res.ok) {
        router.push("/intake/thanks");
        return;
      }
      setError(res.error || t("errorGeneric"));
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate>
      {/* Hidden: submission language + honeypot + time-trap stamp. */}
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="natType" value={natType} />
      <input type="hidden" name="startedAt" value={startedAt} />
      <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden">
        <label>
          Company
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>

      {/* 1 · The person who has passed */}
      <Section title={t("sec.deceased")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("f.surname")} required>
            <input className={inputCls} name="surname" autoComplete="off" />
          </Field>
          <Field label={t("f.firstname")} required>
            <input className={inputCls} name="firstname" autoComplete="off" />
          </Field>
          <Field label={t("f.dob")}>
            <input type="date" className={inputCls} name="dob" />
          </Field>
          <Field label={t("f.pob")}>
            <input className={inputCls} name="pob" autoComplete="off" />
          </Field>
          <Field label={t("f.address")} span2>
            <input className={inputCls} name="address" autoComplete="off" />
          </Field>
          <Field label={t("f.country")}>
            <input
              className={inputCls}
              name="country"
              autoComplete="off"
              placeholder={t("ph.country")}
            />
          </Field>
          <Field label={t("f.nationality")}>
            <input className={inputCls} name="nationality" autoComplete="off" />
          </Field>

          {/* Israeli citizen ⇄ foreigner toggle → ID or passport No. */}
          <div className="sm:col-span-2">
            <div className="mb-2.5 flex overflow-hidden rounded-xl border border-line">
              {(["israeli", "foreigner"] as const).map((typ) => (
                <button
                  key={typ}
                  type="button"
                  onClick={() => setNatType(typ)}
                  className={`min-h-11 flex-1 px-3 py-2 text-[13px] font-medium ${
                    natType === typ ? "bg-ink text-bg" : "bg-bg text-muted"
                  }`}
                >
                  {typ === "israeli" ? t("seg.citizen") : t("seg.foreigner")}
                </button>
              ))}
            </div>
            <Field
              label={natType === "israeli" ? t("f.idIsraeli") : t("f.idPassport")}
            >
              <input
                className={inputCls}
                name="id_number"
                autoComplete="off"
                inputMode={natType === "israeli" ? "numeric" : "text"}
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* 2 · The passing */}
      <Section title={t("sec.death")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("f.dod")} required>
            <input type="date" className={inputCls} name="dod" />
          </Field>
          <Field label={t("f.pod")}>
            <input className={inputCls} name="pod" autoComplete="off" />
          </Field>
          <Field label={t("f.cause")} span2>
            <input className={inputCls} name="cause" autoComplete="off" />
          </Field>
        </div>
      </Section>

      {/* 3 · Burial in Israel */}
      <Section title={t("sec.burial")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("f.burial")} span2>
            <input
              className={inputCls}
              name="burial_place"
              autoComplete="off"
              placeholder={t("ph.burial")}
            />
          </Field>
        </div>
      </Section>

      {/* 4 · Documents */}
      <Section title={t("sec.docs")}>
        <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
          {t("docs.lead")}
        </p>
        <div className="flex flex-col gap-2.5">
          {DOC_SLOTS.map((slot) => (
            <div
              key={slot.key}
              className="rounded-xl border border-dashed border-line p-3"
            >
              <label className="flex flex-col gap-2 text-[13.5px] font-medium">
                {t(`docs.${slot.key}`)}
                <input
                  type="file"
                  name={`doc_${slot.key}`}
                  accept="image/*,.pdf,application/pdf"
                  multiple={slot.multi}
                  className="min-w-0 text-[13px] font-normal text-muted file:mr-2.5 file:min-h-9 file:rounded-xl file:border file:border-line file:bg-bg file:px-3 file:text-[13px] file:font-medium file:text-ink"
                />
              </label>
            </div>
          ))}
        </div>
      </Section>

      {/* Privacy + consent (GDPR — public data-collection point) */}
      <section className="mb-4 rounded-card border border-line bg-card p-4">
        <p className="text-[12.5px] leading-relaxed text-muted">{t("privacy")}</p>
        <label className="mt-3 flex cursor-pointer items-start gap-3 text-[13.5px]">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-0.5 h-5 w-5 shrink-0 accent-ink"
          />
          <span>
            {t("consentLabel")}
            <span className="text-urgent"> *</span>
          </span>
        </label>
      </section>

      {error ? (
        <p className="mb-3 rounded-card border border-urgent/40 px-4 py-2.5 t-meta font-medium text-urgent">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="pressable flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-ink px-4 text-[15px] font-semibold text-bg disabled:opacity-60"
      >
        <IconPlus size={16} />
        {busy ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 rounded-card border border-line bg-card p-4">
      <h2 className="mb-3.5 t-label">
        {title}
      </h2>
      {children}
    </section>
  );
}
