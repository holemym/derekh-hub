import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCase, activityForCase } from "@/lib/repo";
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
  const activity = await activityForCase(c.id);

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
        className="mb-4 inline-flex min-h-11 items-center gap-1 t-meta font-medium text-muted"
      >
        <IconChevronRight size={16} className="rotate-180" />
        {t("caseDetail.back")}
      </Link>

      {/* Header */}
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 dir="rtl" lang="he" className="t-display text-left">
            {c.hebrewName}
          </h1>
          <p className="mt-1 t-meta text-muted">{c.secularName}</p>
        </div>
        {c.urgent ? (
          <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-chip border border-urgent/40 px-2.5 py-1 t-meta font-medium text-urgent">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-urgent" />
            {t("common.urgent")}
          </span>
        ) : null}
      </div>
      {c.urgent && c.urgencyNote ? (
        <p className="mb-4 t-meta font-medium text-urgent">{c.urgencyNote}</p>
      ) : (
        <div className="mb-4" />
      )}

      <CaseActions c={c} />

      {/* Two columns on desktop: summary/pipeline left, workstreams right. */}
      <div className="mt-6 grid gap-x-8 gap-y-6 lg:grid-cols-2">
        {/* LEFT — pipeline + details */}
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="t-label mb-2 px-1">{t("caseDetail.pipeline")}</h2>
            <PipelineStepper c={c} />
          </section>

          <section>
            <h2 className="t-label mb-2 px-1">{t("caseDetail.details")}</h2>
            <dl className="surface px-4">
              {fields
                .filter(([, v]) => v)
                .map(([label, value], i) => (
                  <div
                    key={label}
                    className={`flex items-baseline justify-between gap-4 py-3 ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <dt className="shrink-0 t-meta text-muted">{label}</dt>
                    <dd className="text-right t-body font-medium">{value}</dd>
                  </div>
                ))}
            </dl>
          </section>
        </div>

        {/* RIGHT — documents, tasks, transport, contacts, activity */}
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="t-label mb-2 px-1">
              {t("caseDetail.sections.documents")}
            </h2>
            <div className="flex flex-col gap-2.5">
              <GeneratePermitButton c={c} />
              <CaseDocuments caseId={c.id} documents={c.documents} />
            </div>
          </section>

          <section>
            <h2 className="t-label mb-2 px-1">
              {t("caseDetail.sections.tasks")}
            </h2>
            <CaseTasks caseId={c.id} tasks={c.tasks} />
          </section>

          <section>
            <h2 className="t-label mb-2 px-1">
              {t("caseDetail.sections.transport")}
            </h2>
            {c.transportLegs.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {c.transportLegs.map((leg) => (
                  <div key={leg.id} className="surface px-4 py-3">
                    <TransitLine leg={leg} />
                    <p className="mt-1.5 t-meta text-muted">
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
          </section>

          <section>
            <h2 className="t-label mb-2 px-1">
              {t("caseDetail.sections.contacts")}
            </h2>
            <EmptyState
              icon={<IconContacts size={22} />}
              title={t("caseDetail.sections.contacts")}
              body={t("caseDetail.empty.contacts")}
            />
          </section>

          <section>
            <h2 className="t-label mb-2 px-1">
              {t("caseDetail.sections.activity")}
            </h2>
            {activity.length > 0 ? (
              <ul className="surface divide-y divide-line overflow-hidden">
                {activity.map((entry) => {
                  const from = entry.detail?.from;
                  const to = entry.detail?.to;
                  const description =
                    entry.action === "stage_changed" &&
                    typeof from === "string" &&
                    typeof to === "string"
                      ? t("caseDetail.activity.stageChanged", {
                          from: t(`stages.${from}`),
                          to: t(`stages.${to}`),
                        })
                      : entry.action;
                  return (
                    <li
                      key={entry.id}
                      className="flex items-baseline justify-between gap-3 px-4 py-3"
                    >
                      <span className="min-w-0">
                        <span className="block t-meta font-medium">
                          {description}
                        </span>
                        {entry.actorLabel ? (
                          <span className="mt-0.5 block t-meta text-muted">
                            {entry.actorLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 t-meta text-muted">
                        {formatDateTime(entry.at, locale)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={<IconActivity size={22} />}
                title={t("caseDetail.sections.activity")}
                body={t("caseDetail.empty.activity")}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
