import { PIPELINE_STAGES, stageIndex, type PipelineStage } from "@/lib/types";

/** Mini pipeline progress bar — 7 hairline segments. */
export default function PipelineBar({ stage }: { stage: PipelineStage }) {
  const current = stageIndex(stage);
  return (
    <div
      className="flex gap-1"
      role="img"
      aria-label={`Stage ${current + 1} of ${PIPELINE_STAGES.length}`}
    >
      {PIPELINE_STAGES.map((s, i) => (
        <span
          key={s}
          className={`h-[3px] flex-1 rounded-full ${
            i <= current ? "bg-ink" : "bg-line"
          }`}
        />
      ))}
    </div>
  );
}
