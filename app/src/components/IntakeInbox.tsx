"use client";

/**
 * STAFF intake inbox list + review sheet (ROADMAP M1). Renders `new` submissions
 * (name + submitted-at + file count), and a review sheet that shows the full
 * payload + attached files (signed-URL open) with Import / Reject actions.
 *
 * All privileged work is in ../app/intake-inbox/actions.ts under the RLS-scoped
 * staff session; this component only collects input and reflects results. Import
 * redirects to the new /cases/[id]; reject removes the row from the inbox.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { InboxSubmission } from "@/app/intake-inbox/page";
import {
  importSubmission,
  rejectSubmission,
  getIntakeFileUrl,
} from "@/app/intake-inbox/actions";
import EmptyState from "@/components/EmptyState";
import { IconChevronRight, IconInbox } from "@/components/icons";

function fullName(p: Record<string, string>, unnamed: string): string {
  const name = [p.firstname, p.surname].filter(Boolean).join(" ").trim();
  return name || unnamed;
}

export default function IntakeInbox({
  submissions,
}: {
  submissions: InboxSubmission[];
}) {
  const t = useTranslations("intakeInbox");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState<InboxSubmission | null>(null);

  if (submissions.length === 0) {
    return (
      <EmptyState icon={<IconInbox size={22} />} title={t("title")} body={t("empty")} />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-card border border-line bg-card">
        {submissions.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpen(s)}
            className={`pressable flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3 text-left ${
              i > 0 ? "border-t border-line" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">
                {fullName(s.payload, t("unnamed"))}
              </p>
              <p className="mt-0.5 truncate text-[13px] text-muted">
                {format.dateTime(new Date(s.submittedAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                · {t("files", { count: s.files.length })}
              </p>
            </div>
            <IconChevronRight size={18} className="shrink-0 text-muted" />
          </button>
        ))}
      </div>

      {open ? (
        <ReviewSheet
          submission={open}
          onClose={() => setOpen(null)}
          onRejected={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function ReviewSheet({
  submission,
  onClose,
  onRejected,
}: {
  submission: InboxSubmission;
  onClose: () => void;
  onRejected: () => void;
}) {
  const t = useTranslations("intakeInbox");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openingPath, setOpeningPath] = useState<string | null>(null);

  const p = submission.payload;
  const idTypeLabel =
    p.natType === "foreigner" ? t("idTypePassport") : t("idTypeIsraeli");

  const rows: Array<[string, string | undefined]> = [
    [t("field.surname"), p.surname],
    [t("field.firstname"), p.firstname],
    [t("field.dob"), p.dob],
    [t("field.pob"), p.pob],
    [t("field.address"), p.address],
    [t("field.country"), p.country],
    [t("field.nationality"), p.nationality],
    [t("field.idType"), idTypeLabel],
    [t("field.idNumber"), p.id_number],
    [t("field.dod"), p.dod],
    [t("field.pod"), p.pod],
    [t("field.cause"), p.cause],
    [t("field.burial"), p.burial_place],
    [t("field.lang"), p.lang],
  ];

  async function onOpenFile(path: string) {
    setError(null);
    setOpeningPath(path);
    const res = await getIntakeFileUrl(path);
    setOpeningPath(null);
    if (!res.ok || !res.url) {
      setError(res.error ?? t("errorOpen"));
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  function onImport() {
    setError(null);
    startTransition(async () => {
      // On success the action redirects (throws NEXT_REDIRECT); a returned result
      // is therefore always a failure.
      try {
        const res = await importSubmission(submission.id);
        if (res && !res.ok) setError(res.error ?? t("errorImport"));
      } catch (e) {
        const msg = (e as Error)?.message ?? "";
        if (!msg.includes("NEXT_REDIRECT")) setError(msg || t("errorImport"));
        else throw e;
      }
    });
  }

  function onReject() {
    if (!window.confirm(t("confirmReject"))) return;
    setError(null);
    startTransition(async () => {
      const res = await rejectSubmission(submission.id);
      if (!res.ok) {
        setError(res.error ?? t("errorReject"));
        return;
      }
      onRejected();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-[520px] overflow-y-auto rounded-t-2xl bg-card p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <strong className="text-[16px]">{t("reviewTitle")}</strong>
          <button
            type="button"
            onClick={onClose}
            className="text-muted"
            aria-label={t("reviewBack")}
          >
            ✕
          </button>
        </div>

        <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted">
          {t("sectionDetails")}
        </h3>
        <dl className="rounded-card border border-line px-4">
          {rows
            .filter(([, v]) => v && v.trim())
            .map(([label, value], i) => (
              <div
                key={label}
                className={`flex items-baseline justify-between gap-4 py-2.5 ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <dt className="shrink-0 text-[13px] text-muted">{label}</dt>
                <dd className="text-right text-sm font-medium">{value}</dd>
              </div>
            ))}
        </dl>

        <h3 className="mb-2 mt-5 text-[13px] font-semibold uppercase tracking-wider text-muted">
          {t("sectionFiles")}
        </h3>
        {submission.files.length > 0 ? (
          <div className="overflow-hidden rounded-card border border-line">
            {submission.files.map((f, i) => (
              <div
                key={f.path}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <span className="min-w-0 truncate text-sm">{f.name}</span>
                <button
                  type="button"
                  onClick={() => onOpenFile(f.path)}
                  disabled={openingPath === f.path}
                  className="pressable min-h-9 shrink-0 rounded-xl border border-line px-3 text-[13px] font-medium text-ink disabled:opacity-50"
                >
                  {openingPath === f.path ? t("opening") : t("openFile")}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted">{t("noFiles")}</p>
        )}

        {error ? (
          <p className="mt-4 rounded-card border border-urgent/40 px-4 py-2.5 text-[13px] font-medium text-urgent">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onImport}
            disabled={pending}
            className="pressable min-h-12 rounded-xl bg-ink text-[15px] font-semibold text-bg disabled:opacity-60"
          >
            {pending ? t("importing") : t("import")}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={pending}
            className="pressable min-h-12 rounded-xl border border-line bg-bg text-[15px] font-semibold text-urgent disabled:opacity-60"
          >
            {t("reject")}
          </button>
        </div>
      </div>
    </div>
  );
}
