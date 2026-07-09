"use client";

/**
 * New-permit FORM — the operator's #1 need: type a niftar's details, get the
 * official Israeli MFA transfer permit (client-side, offline, standalone parity)
 * AND save the entry as a case in the hub.
 *
 * Faithful to burial-permit-v2/dev/template.html's field set + dead-simple one-
 * screen UX, rebuilt in the hub's monoline design (tokens: card/line/ink/muted),
 * mobile-first, EN/DE via next-intl. Native date inputs. Per-box ID/funeral-No.
 * A brief plain-language review sheet appears before the permit is created.
 *
 * Two actions:
 *   • Generate permit — fully client-side from current values (no save needed):
 *     fetch the blank PDF → buildPermitContextFromForm → generate() → download,
 *     with a DELAYED URL.revokeObjectURL (revoking immediately cancels it).
 *   • Save to hub — server action inserts a case (+ optional air-cargo leg) and
 *     redirects to /cases/[id].
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { generate, validate } from "@/lib/doc-engine";
import type { FormTemplate } from "@/lib/doc-engine";
import template from "@/lib/documents/templates/il-mfa-transfer-permit.json";
import {
  emptyPermitForm,
  buildPermitContextFromForm,
  type PermitForm,
  type PermitFormDocuments,
} from "@/lib/documents/form";
import { saveCaseFromForm } from "@/app/cases/new/actions";
import { aiExtractCertificate } from "@/app/cases/new/ai-actions";
import { IconCheck, IconDoc } from "@/components/icons";

const FORM_URL = "/forms/il-mfa-transfer-permit.pdf";

/** ISO YYYY-MM-DD for "today" in the browser's local zone. */
function todayIso(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function permitFilename(form: PermitForm): string {
  const last =
    form.surname.trim().replace(/[^A-Za-z0-9]/g, "") ||
    form.firstname.trim().replace(/[^A-Za-z0-9]/g, "") ||
    "case";
  return `burial-permit_${last}_${todayIso()}.pdf`;
}

/** The 9 attached-document checkboxes, in the official form's order. */
const DOC_KEYS: Array<keyof PermitFormDocuments> = [
  "death_certificate",
  "id_copy",
  "doctor_certificate",
  "local_transfer_permit",
  "sealing_permit",
  "c19_sealing",
  "funeral_acceptance",
  "preservation_certificate",
  "moh_permit",
];

/* ── Small presentational helpers (hub tokens) ───────────────────────────── */

function Field({
  label,
  he,
  required,
  span2,
  children,
}: {
  label: string;
  he?: string;
  required?: boolean;
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={span2 ? "sm:col-span-2" : undefined}>
      <label className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium">
        <span>
          {label}
          {required ? <span className="text-urgent"> *</span> : null}
        </span>
        {he ? (
          <span dir="rtl" lang="he" className="text-[12px] font-normal text-muted">
            {he}
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "min-h-11 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[15px] text-ink outline-none focus:border-ink";

export default function NewPermitForm({
  aiEnabled = false,
}: {
  /** ANTHROPIC_API_KEY present → offer certificate-OCR autofill (M5). */
  aiEnabled?: boolean;
}) {
  const t = useTranslations("newPermit");
  const [form, setForm] = useState<PermitForm>(() => emptyPermitForm(todayIso()));
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState<null | "generate" | "save">(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof PermitForm>(key: K, value: PermitForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDone(false);
  }

  /** Merge OCR'd certificate fields into the form (only non-empty values). */
  function applyExtracted(fields: Record<string, string | undefined>) {
    setForm((f) => {
      const next = { ...f };
      for (const key of [
        "surname",
        "firstname",
        "dob",
        "pob",
        "address",
        "nationality",
        "dod",
        "pod",
        "cause",
        "icd",
      ] as const) {
        const v = fields[key];
        if (v) next[key] = v;
      }
      return next;
    });
    setDone(false);
  }
  function toggleDoc(key: keyof PermitFormDocuments) {
    setForm((f) => ({
      ...f,
      documents: { ...f.documents, [key]: !f.documents[key] },
    }));
  }

  const missing = useMemo(() => {
    const req: Array<[keyof PermitForm | "id", string]> = [
      ["surname", t("f.surname")],
      ["firstname", t("f.firstname")],
      ["dob", t("f.dob")],
      ["dod", t("f.dod")],
      ["id", form.natType === "israeli" ? t("f.idIsraeli") : t("f.idPassport")],
      ["burial_place", t("f.burial")],
      ["funeral_service", t("f.fsName")],
    ];
    return req
      .filter(([k]) =>
        k === "id" ? !form.id_number.trim() : !String(form[k as keyof PermitForm]).trim(),
      )
      .map(([, label]) => label);
  }, [form, t]);

  async function doGenerate() {
    setBusy("generate");
    setError(null);
    try {
      const tpl = template as unknown as FormTemplate;
      const ctx = buildPermitContextFromForm(form) as unknown as Record<
        string,
        unknown
      >;
      validate(tpl, ctx); // surfaces nothing blocking; mirrors live tool
      const res = await fetch(FORM_URL);
      if (!res.ok) throw new Error(`Could not load blank form (${res.status})`);
      const pdfBytes = new Uint8Array(await res.arrayBuffer());
      const filled = await generate(tpl, pdfBytes, ctx);

      const blob = new Blob([filled as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = permitFilename(form);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Delayed revoke — immediate revoke can cancel the download.
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      setDone(true);
      setReview(false);
    } catch (e) {
      setError((e as Error).message || "Generation failed");
    } finally {
      setBusy(null);
    }
  }

  async function doSave() {
    setBusy("save");
    setError(null);
    try {
      // On success the server action redirects (throws NEXT_REDIRECT) and never
      // returns a result — so a returned result is always a failure.
      const result = await saveCaseFromForm(form);
      if (result && !result.ok) setError(result.error ?? "Could not save case.");
    } catch (e) {
      // A redirect throw is expected — Next re-raises it; anything else is real.
      const msg = (e as Error)?.message ?? "";
      if (!msg.includes("NEXT_REDIRECT")) {
        setError(msg || "Could not save case.");
      } else {
        throw e;
      }
    } finally {
      setBusy(null);
    }
  }

  /* ── Review recap rows ─────────────────────────────────────────────────── */
  const recap: Array<[string, string]> = [
    [t("f.surname"), form.surname],
    [t("f.firstname"), form.firstname],
    [t("f.dob"), form.dob],
    [form.natType === "israeli" ? t("f.idIsraeli") : t("f.idPassport"), form.id_number],
    [t("f.dod"), form.dod],
    [t("f.burial"), form.burial_place],
    [t("f.fsName"), form.funeral_service],
  ].filter(([, v]) => v.trim()) as Array<[string, string]>;
  const docCount = DOC_KEYS.filter((k) => form.documents[k]).length;

  return (
    <div className="rise-in">
      {/* AI autofill from a death certificate (M5, env-gated). */}
      {aiEnabled ? <CertificateAutofill onExtracted={applyExtracted} /> : null}

      {/* 1 · Deceased */}
      <Section num={1} title={t("s.deceased")} he="פרטי המנוח/ה">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("f.surname")} he="שם המשפחה" required>
            <input
              className={inputCls}
              value={form.surname}
              onChange={(e) => set("surname", e.target.value)}
            />
          </Field>
          <Field label={t("f.firstname")} he="השם הפרטי" required>
            <input
              className={inputCls}
              value={form.firstname}
              onChange={(e) => set("firstname", e.target.value)}
            />
          </Field>
          <Field label={t("f.hebrewName")} he="שם עברי" span2>
            <input
              dir="rtl"
              lang="he"
              className={inputCls}
              value={form.hebrew_name}
              onChange={(e) => set("hebrew_name", e.target.value)}
            />
          </Field>
          <Field label={t("f.dob")} he="תאריך הלידה" required>
            <input
              type="date"
              className={inputCls}
              value={form.dob}
              onChange={(e) => set("dob", e.target.value)}
            />
          </Field>
          <Field label={t("f.pob")} he="מקום הלידה">
            <input
              className={inputCls}
              value={form.pob}
              onChange={(e) => set("pob", e.target.value)}
            />
          </Field>
          <Field label={t("f.address")} he="הכתובת הקבועה האחרונה" span2>
            <input
              className={inputCls}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </Field>
          <Field label={t("f.nationality")} he="אזרחות" span2>
            <input
              className={inputCls}
              value={form.nationality}
              onChange={(e) => set("nationality", e.target.value)}
            />
          </Field>

          {/* Nationality toggle → ID No. or Passport No. */}
          <div className="sm:col-span-2">
            <div className="mb-2.5 flex overflow-hidden rounded-xl border border-line">
              {(["israeli", "foreigner"] as const).map((typ) => (
                <button
                  key={typ}
                  type="button"
                  onClick={() => set("natType", typ)}
                  className={`min-h-11 flex-1 px-3 py-2 text-[13px] font-medium ${
                    form.natType === typ
                      ? "bg-ink text-bg"
                      : "bg-bg text-muted"
                  }`}
                >
                  {typ === "israeli" ? t("seg.citizen") : t("seg.foreigner")}
                </button>
              ))}
            </div>
            <Field
              label={
                form.natType === "israeli" ? t("f.idIsraeli") : t("f.idPassport")
              }
              required
            >
              <DigitInput
                value={form.id_number}
                onChange={(v) => set("id_number", v)}
                maxLength={10}
                mono={form.natType === "israeli"}
                placeholder={form.natType === "israeli" ? "0000000000" : "A0000000"}
              />
              <p className="mt-1.5 text-[12px] text-muted">{t("hint.id")}</p>
            </Field>
          </div>
        </div>
      </Section>

      {/* 2 · Death */}
      <Section num={2} title={t("s.death")} he="הפטירה">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("f.dod")} he="תאריך הפטירה" required>
            <input
              type="date"
              className={inputCls}
              value={form.dod}
              onChange={(e) => set("dod", e.target.value)}
            />
          </Field>
          <Field label={t("f.pod")} he="מקום הפטירה">
            <input
              className={inputCls}
              value={form.pod}
              onChange={(e) => set("pod", e.target.value)}
            />
          </Field>
          <Field label={t("f.cause")} he="סיבת הפטירה">
            <input
              className={inputCls}
              value={form.cause}
              onChange={(e) => set("cause", e.target.value)}
            />
          </Field>
          <Field label={t("f.icd")}>
            <input
              className={inputCls}
              value={form.icd}
              onChange={(e) => set("icd", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* 3 · Transfer */}
      <Section num={3} title={t("s.transfer")} he="ההעברה לישראל">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("f.burial")} he="מקום הקבורה בישראל" required span2>
            <input
              className={inputCls}
              value={form.burial_place}
              onChange={(e) => set("burial_place", e.target.value)}
            />
          </Field>
          <Field label={t("f.flight")} he="מספר הטיסה">
            <input
              className={inputCls}
              value={form.flight}
              onChange={(e) => set("flight", e.target.value)}
            />
          </Field>
          <Field label={t("f.airline")} he="שם חברת התעופה">
            <input
              className={inputCls}
              value={form.airline}
              onChange={(e) => set("airline", e.target.value)}
            />
          </Field>
          <Field label={t("f.disembark")} he="נמל הכניסה לישראל">
            <input
              className={inputCls}
              placeholder="Ben Gurion Airport"
              value={form.disembarkation}
              onChange={(e) => set("disembarkation", e.target.value)}
            />
          </Field>
          <Field label={t("f.transfer")} he="תאריך העברת הגופה">
            <input
              type="date"
              className={inputCls}
              value={form.transfer_date}
              onChange={(e) => set("transfer_date", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* 4 · Funeral service */}
      <Section num={4} title={t("s.funeral")} he="חברת הקבורה בישראל">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("f.fsName")} he="שם וכתובת חברת הקבורה" required span2>
            <input
              className={inputCls}
              value={form.funeral_service}
              onChange={(e) => set("funeral_service", e.target.value)}
            />
          </Field>
          <Field label={t("f.fsNo")} he="מס׳ חברת הקבורה">
            <DigitInput
              value={form.funeral_no}
              onChange={(v) => set("funeral_no", v)}
              maxLength={9}
              mono
              placeholder="000000000"
            />
            <p className="mt-1.5 text-[12px] text-muted">{t("hint.fs")}</p>
          </Field>
          <Field label={t("f.license")} he="תאריך תפוגת הרישיון">
            <input
              type="date"
              className={inputCls}
              value={form.license_expiry}
              onChange={(e) => set("license_expiry", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* 5 · Attached documents */}
      <Section num={5} title={t("s.documents")} he="מסמכים נלווים">
        <div className="overflow-hidden rounded-card border border-line bg-card">
          {DOC_KEYS.map((key, i) => (
            <label
              key={key}
              className={`flex cursor-pointer items-start gap-3 px-4 py-3 ${
                i > 0 ? "border-t border-line" : ""
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-ink"
                checked={form.documents[key]}
                onChange={() => toggleDoc(key)}
              />
              <span className="text-[14px]">
                {t(`doc.${key}`)}
                <span dir="rtl" lang="he" className="block text-[12px] text-muted">
                  {t(`docHe.${key}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      {/* 6 · Declaration */}
      <Section num={6} title={t("s.declaration")} he="הצהרת חברת הקבורה">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("f.decl")} he="תאריך">
            <input
              type="date"
              className={inputCls}
              value={form.decl_date}
              onChange={(e) => set("decl_date", e.target.value)}
            />
          </Field>
        </div>
        <p className="mt-3 text-[12.5px] text-muted">{t("declNote")}</p>
      </Section>

      {error ? (
        <p className="mb-3 rounded-card border border-urgent/40 px-4 py-2.5 text-[13px] font-medium text-urgent">
          {error}
        </p>
      ) : null}

      {/* Actions */}
      <div className="sticky bottom-24 z-10 -mx-4 mt-6 border-t border-line bg-card/95 px-4 py-3 backdrop-blur">
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => (missing.length ? setReview(true) : doGenerate())}
            disabled={busy !== null}
            className="pressable flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink px-4 text-[15px] font-semibold text-bg disabled:opacity-60"
          >
            {done ? <IconCheck size={16} /> : null}
            {busy === "generate"
              ? t("generating")
              : done
                ? t("generated")
                : t("generate")}
          </button>
          <button
            type="button"
            onClick={doSave}
            disabled={busy !== null}
            className="pressable flex min-h-12 items-center justify-center rounded-xl border border-line bg-bg px-4 text-[15px] font-semibold text-ink disabled:opacity-60"
          >
            {busy === "save" ? t("saving") : t("save")}
          </button>
        </div>
      </div>

      {/* Review sheet */}
      {review ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center"
          onClick={() => setReview(false)}
        >
          <div
            className="w-full max-w-[460px] rounded-t-2xl bg-card p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <strong className="text-[16px]">{t("review.title")}</strong>
              <button
                type="button"
                onClick={() => setReview(false)}
                className="text-muted"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {missing.length ? (
              <p className="mb-3 text-[13px] font-medium text-urgent">
                {t("review.missing", { fields: missing.join(", ") })}
              </p>
            ) : null}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
              {recap.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
              <dt className="text-muted">{t("review.documents")}</dt>
              <dd className="font-medium">{t("review.docCount", { count: docCount })}</dd>
            </dl>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={doGenerate}
                disabled={busy !== null}
                className="pressable min-h-12 rounded-xl bg-ink text-[15px] font-semibold text-bg disabled:opacity-60"
              >
                {busy === "generate" ? t("generating") : t("review.confirm")}
              </button>
              <button
                type="button"
                onClick={() => setReview(false)}
                className="pressable min-h-12 rounded-xl border border-line bg-bg text-[15px] font-semibold text-ink"
              >
                {t("review.back")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── Section wrapper ─────────────────────────────────────────────────────── */

function Section({
  num,
  title,
  he,
  children,
}: {
  num: number;
  title: string;
  he: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 rounded-card border border-line bg-card p-4">
      <h2 className="mb-3.5 flex items-baseline gap-2 text-[13px] font-semibold uppercase tracking-wider text-muted">
        <span className="text-ink">{num}</span>
        <span>{title}</span>
        <span dir="rtl" lang="he" className="font-normal">
          {he}
        </span>
      </h2>
      {children}
    </section>
  );
}

/* ── Certificate OCR autofill (M5, env-gated) ────────────────────────────── */

function CertificateAutofill({
  onExtracted,
}: {
  onExtracted: (fields: Record<string, string | undefined>) => void;
}) {
  const t = useTranslations("copilot");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState(false);

  async function onFill() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setFilled(false);
    try {
      const fd = new FormData();
      fd.set("certificate", file);
      const res = await aiExtractCertificate(fd);
      if (!res.ok || !res.fields) {
        setError(res.error ?? t("error"));
        return;
      }
      onExtracted(res.fields as Record<string, string | undefined>);
      setFilled(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 rounded-card border border-dashed border-line bg-card p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-muted">
        <IconDoc size={14} />
        {t("certTitle")}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setFilled(false);
          }}
          className="min-h-11 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-[13px] text-muted file:mr-2 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-bg"
        />
        <button
          type="button"
          onClick={onFill}
          disabled={!file || busy}
          className="pressable flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg disabled:opacity-60"
        >
          {filled ? <IconCheck size={14} /> : null}
          {busy ? t("reading") : filled ? t("filled") : t("certFill")}
        </button>
      </div>
      <p className="mt-2 text-[12px] text-muted">{t("certNote")}</p>
      {error ? (
        <p className="mt-2 text-[13px] font-medium text-urgent">{error}</p>
      ) : null}
    </section>
  );
}

/* ── Per-character grid input (ID / funeral No.) ─────────────────────────── */

function DigitInput({
  value,
  onChange,
  maxLength,
  mono,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  mono: boolean;
  placeholder?: string;
}) {
  return (
    <input
      className={`${inputCls} ${mono ? "font-mono tracking-[0.35em]" : ""}`}
      value={value}
      maxLength={maxLength}
      inputMode={mono ? "numeric" : "text"}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
    />
  );
}
