import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCase } from "@/lib/repo";
import { formatDate, formatDateTime } from "@/lib/format";
import PipelineStepper from "@/components/PipelineStepper";
import CaseActions from "@/components/CaseActions";
import GeneratePermitButton from "@/components/GeneratePermitButton";
import CaseDocuments from "@/components/CaseDocuments";
import CaseTasks from "@/components/CaseTasks";
import TransitLine from "@/components/TransitLine";
import EmptyState from "@/components/EmptyState";
import {
  IconChevronRight,
  IconPlane,
  IconContacts,
  IconActivity,
} from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await getCase(id);
  if (!c) notFound();

  const t = await getTranslations();
  const locale = await getLocale();

  const fields: Array<[string, string | undefined]> = [
    [t("caseDetail.fields.dob"), c.dob ? formatDate(c.dob, locale) : undefined],
    [t("caseDetail.fields.dod"), formatDateTime(c.dod, locale)],
    [t("caseDetail.fields.placeOfDeath"), c.placeOfDeath],
    [t("caseDetail.fields.passport"), c.idOrPassport],
    [t("caseDetail.fields.nationality"), c.nationality],
    [t("caseDetail.fields.cemetery"), c.cemetery],
    [t("caseDetail.fields.burialPlace"), c.burialPlace],
    [t("caseDetail.fields.assignedTo"), c.assignedTo],
  ];

  return (
    <div className="rise-in">
      <Link
        href="/cases"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted"
      >
        <IconChevronRight size={16} className="rotate-180" />
        {t("caseDetail.back")}
      </Link>

      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 dir="rtl" lang="he" className="text-left text-2xl font-semibold tracking-tight">
            {c.hebrewName}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{c.secularName}</p>
        </div>
        {c.urgent ? (
          <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-chip border border-urgent/40 px-2.5 py-1 text-xs font-medium text-urgent">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-urgent" />
            {t("common.urgent")}
          </span>
        ) : null}
      </div>
      {c.urgent && c.urgencyNote ? (
        <p className="mb-4 text-[13px] font-medium text-urgent">
          {c.urgencyNote}
        </p>
      ) : (
        <div className="mb-4" />
      )}

      <CaseActions c={c} />

      {/* Pipeline */}
      <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
        {t("caseDetail.pipeline")}
      </h2>
      <PipelineStepper c={c} />

      {/* Details */}
      <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
        {t("caseDetail.details")}
      </h2>
      <dl className="rounded-card border border-line bg-card px-4">
        {fields
          .filter(([, v]) => v)
          .map(([label, value], i) => (
            <div
              key={label}
              className={`flex items-baseline justify-between gap-4 py-3 ${
                i > 0 ? "border-t border-line" : ""
              }`}
            >
              <dt className="shrink-0 text-[13px] text-muted">{label}</dt>
              <dd className="text-right text-sm font-medium">{value}</dd>
            </div>
          ))}
      </dl>

      {/* Documents — client-side permit generation (doc-engine, ROADMAP M1) */}
      <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
        {t("caseDetail.sections.documents")}
      </h2>
      <div className="flex flex-col gap-2.5">
        {/* The Israeli MFA transfer permit generates on-device from this case
            (download) and can be saved into the case-docs vault. */}
        <GeneratePermitButton c={c} />

        {/* The document vault: uploaded scans + saved permits, with signed-URL
            download and delete. Private `case-docs` bucket, RLS-scoped. */}
        <CaseDocuments caseId={c.id} documents={c.documents} />
      </div>

      {/* Tasks — per-case planning layer (ROADMAP M2) */}
      <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
        {t("caseDetail.sections.tasks")}
      </h2>
      <CaseTasks caseId={c.id} tasks={c.tasks} />

      {/* Transport */}
      <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
        {t("caseDetail.sections.transport")}
      </h2>
      {c.transportLegs.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {c.transportLegs.map((leg) => (
            <div
              key={leg.id}
              className="rounded-card border border-line bg-card px-4 py-3"
            >
              <TransitLine leg={leg} />
              <p className="mt-1.5 text-xs text-muted">
                {leg.carrier}
                {leg.scheduledAt
                  ? ` · ${formatDateTime(leg.scheduledAt, locale)}`
                  : null}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<IconPlane size={22} />}
          title={t("caseDetail.sections.transport")}
          body={t("caseDetail.empty.transport")}
        />
      )}

      {/* Contacts */}
      <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
        {t("caseDetail.sections.contacts")}
      </h2>
      <EmptyState
        icon={<IconContacts size={22} />}
        title={t("caseDetail.sections.contacts")}
        body={t("caseDetail.empty.contacts")}
      />

      {/* Activity */}
      <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
        {t("caseDetail.sections.activity")}
      </h2>
      <EmptyState
        icon={<IconActivity size={22} />}
        title={t("caseDetail.sections.activity")}
        body={t("caseDetail.empty.activity")}
      />
    </div>
  );
}
