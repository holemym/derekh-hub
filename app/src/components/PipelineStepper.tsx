import { getLocale, getTranslations } from "next-intl/server";
import { PIPELINE_STAGES, stageIndex, type Case } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { IconCheckDraw } from "./icons";
import PipelineStageButton from "./PipelineStageButton";

/**
 * Vertical 7-stage pipeline stepper for the case detail view. Done + current
 * stages are static; FUTURE stages are forward-jump targets (client button →
 * advanceCaseStage, forward-only, confirmed since a jump skips stages). A buried
 * case has no future stages, so the whole stepper is inert.
 */
export default async function PipelineStepper({ c }: { c: Case }) {
  const t = await getTranslations("stages");
  const tc = await getTranslations("caseDetail");
  const locale = await getLocale();
  const current = stageIndex(c.status);

  return (
    <ol className="surface px-4 py-2">
      {PIPELINE_STAGES.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        const future = i > current;
        const ts = c.stageTimestamps[stage];

        const row = (
          <>
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                done
                  ? "border-ink bg-ink text-bg"
                  : active
                    ? "border-ink"
                    : "border-line text-muted"
              }`}
            >
              {done ? (
                <IconCheckDraw size={14} strokeWidth={2} />
              ) : active ? (
                <span
                  className={`h-1.5 w-1.5 rounded-full bg-ink ${
                    c.urgent ? "pulse-dot bg-urgent" : ""
                  }`}
                />
              ) : null}
            </span>

            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
              <span
                className={`t-body ${
                  active
                    ? "font-semibold"
                    : done
                      ? "font-medium"
                      : "text-muted"
                }`}
              >
                {t(stage)}
              </span>
              {ts ? (
                <span className="shrink-0 t-meta text-muted">
                  {formatDateTime(ts, locale)}
                </span>
              ) : null}
            </div>
          </>
        );

        return (
          <li key={stage} className="relative flex gap-3 py-2.5">
            {/* connector */}
            {i < PIPELINE_STAGES.length - 1 ? (
              <span
                aria-hidden
                className={`absolute left-[11px] top-8 h-[calc(100%-14px)] w-px ${
                  i < current ? "bg-ink" : "bg-line"
                }`}
              />
            ) : null}

            {future ? (
              <PipelineStageButton
                caseId={c.id}
                stage={stage}
                stageLabel={t(stage)}
              >
                {row}
              </PipelineStageButton>
            ) : (
              <div className="flex w-full items-start gap-3">{row}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
