import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { casesByStage } from "@/lib/repo";
import { PIPELINE_STAGES } from "@/lib/types";
import { IconChevronRight } from "@/components/icons";

export const dynamic = "force-dynamic";

/** All cases, grouped by pipeline stage. */
export default async function CasesPage() {
  const t = await getTranslations();
  const grouped = casesByStage();

  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">
        {t("cases.title")}
      </h1>

      <div className="flex flex-col gap-6">
        {PIPELINE_STAGES.map((stage) => {
          const cases = grouped.get(stage) ?? [];
          if (cases.length === 0) return null;
          return (
            <section key={stage}>
              <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
                {t(`stages.${stage}`)}
                <span className="font-normal">{cases.length}</span>
              </h2>
              <div className="overflow-hidden rounded-card border border-line bg-card">
                {cases.map((c, i) => (
                  <Link
                    key={c.id}
                    href={`/cases/${c.id}`}
                    className={`pressable flex min-h-[60px] items-center justify-between gap-3 px-4 py-3 ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p dir="rtl" lang="he" className="truncate text-left text-[15px] font-semibold">
                        {c.hebrewName}
                      </p>
                      <p className="truncate text-[13px] text-muted">
                        {c.secularName}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      {c.urgent ? (
                        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-urgent" />
                      ) : null}
                      <IconChevronRight size={18} className="text-muted" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
