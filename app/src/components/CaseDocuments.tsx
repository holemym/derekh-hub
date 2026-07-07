"use client";

/**
 * Per-case document vault (ROADMAP M1). Lists a case's `documents` rows with a
 * Download (short-lived signed URL), an Upload control (staff), and Delete.
 *
 * All privileged work happens in server actions (../app/cases/[id]/documents/
 * actions.ts) under the RLS-scoped staff session — this component only collects
 * input and reflects results. Files live in the PRIVATE `case-docs` bucket;
 * downloads are signed URLs minted on demand, never public links.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CaseDocument } from "@/lib/types";
import {
  uploadDocument,
  getDocumentUrl,
  deleteDocument,
} from "@/app/cases/[id]/documents/actions";
import { IconDoc, IconPlus } from "@/components/icons";

/** Document kinds offered in the upload select (label keys under docTypes.*). */
const DOC_TYPES = [
  "death_certificate",
  "id_copy",
  "doctor_certificate",
  "local_transfer_permit",
  "sealing_permit",
  "funeral_acceptance",
  "other",
] as const;

export default function CaseDocuments({
  caseId,
  documents,
}: {
  caseId: string;
  documents: CaseDocument[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]>(
    "death_certificate",
  );
  const fileRef = useRef<HTMLInputElement>(null);

  async function onDownload(doc: CaseDocument) {
    if (!doc.file) return;
    setError(null);
    setBusyId(doc.id);
    const res = await getDocumentUrl(doc.file);
    setBusyId(null);
    if (!res.ok || !res.url) {
      setError(res.error ?? t("documents.errorDownload"));
      return;
    }
    // Open the signed URL in a new tab — a private-bucket link, valid ~60s.
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("caseId", caseId);
    fd.set("type", docType);
    startTransition(async () => {
      const res = await uploadDocument(fd);
      if (!res.ok) {
        setError(res.error ?? t("documents.errorUpload"));
        return;
      }
      form.reset();
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  function onDelete(doc: CaseDocument) {
    if (!window.confirm(t("documents.confirmDelete"))) return;
    setError(null);
    setBusyId(doc.id);
    startTransition(async () => {
      const res = await deleteDocument({
        caseId,
        documentId: doc.id,
        storagePath: doc.file,
      });
      setBusyId(null);
      if (!res.ok) {
        setError(res.error ?? t("documents.errorDelete"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Existing documents */}
      {documents.length > 0 ? (
        <div className="overflow-hidden rounded-card border border-line bg-card">
          {documents.map((d, i) => (
            <div
              key={d.id}
              className={`flex min-h-[52px] items-center justify-between gap-3 px-4 py-3 ${
                i > 0 ? "border-t border-line" : ""
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <IconDoc size={18} className="shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {t.has(`docTypes.${d.title}`)
                      ? t(`docTypes.${d.title}`)
                      : d.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-muted">
                    {t.has(`documents.status.${d.status}`)
                      ? t(`documents.status.${d.status}`)
                      : d.status}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {d.file ? (
                  <button
                    type="button"
                    onClick={() => onDownload(d)}
                    disabled={busyId === d.id || pending}
                    className="pressable min-h-9 rounded-xl border border-line px-3 text-[13px] font-medium text-ink disabled:opacity-50"
                  >
                    {busyId === d.id
                      ? t("documents.opening")
                      : t("documents.download")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onDelete(d)}
                  disabled={busyId === d.id || pending}
                  aria-label={t("documents.delete")}
                  className="pressable min-h-9 rounded-xl border border-line px-3 text-[13px] font-medium text-urgent disabled:opacity-50"
                >
                  {t("documents.delete")}
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Upload control (staff) */}
      <form
        onSubmit={onUpload}
        className="rounded-card border border-line bg-card px-4 py-3"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={docType}
            onChange={(e) =>
              setDocType(e.target.value as (typeof DOC_TYPES)[number])
            }
            className="min-h-9 flex-1 rounded-xl border border-line bg-bg px-2.5 text-[13px] text-ink"
          >
            {DOC_TYPES.map((k) => (
              <option key={k} value={k}>
                {t(`docTypes.${k}`)}
              </option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            name="file"
            required
            className="min-w-0 flex-1 text-[13px] text-muted file:mr-2.5 file:min-h-9 file:rounded-xl file:border file:border-line file:bg-bg file:px-3 file:text-[13px] file:font-medium file:text-ink"
          />
          <button
            type="submit"
            disabled={pending}
            className="pressable flex min-h-9 shrink-0 items-center gap-1 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg disabled:opacity-60"
          >
            <IconPlus size={15} />
            {pending ? t("documents.uploading") : t("documents.upload")}
          </button>
        </div>
      </form>

      {error ? (
        <p className="px-1 text-[13px] font-medium text-urgent">{error}</p>
      ) : null}
    </div>
  );
}
