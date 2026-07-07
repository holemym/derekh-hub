"use client";

/**
 * Today "Due soon" list (ROADMAP M2): open tasks that are overdue, due today,
 * or due before the next candle-lighting. Overdue tasks carry the red accent;
 * a task due on Shabbos/chag is flagged. Complete-in-place via the RLS-scoped
 * server action. The parent decides which tasks land here (dueSoonTasks()).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { Task } from "@/lib/types";
import { completeTask } from "@/app/tasks/actions";
import { isOverdue, fallsOnShabbosOrChag } from "@/lib/planning";
import { formatDateTime } from "@/lib/format";
import { IconCheck, IconCandles } from "@/components/icons";

export default function DueSoonTasks({ tasks }: { tasks: Task[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const now = new Date();

  function onComplete(tk: Task) {
    setBusyId(tk.id);
    startTransition(async () => {
      await completeTask({ id: tk.id, caseId: tk.caseId });
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-card">
      {tasks.map((tk, i) => {
        const overdue = isOverdue(tk, now);
        const onShabbos = fallsOnShabbosOrChag(tk.due);
        return (
          <div
            key={tk.id}
            className={`flex min-h-[52px] items-center justify-between gap-3 px-4 py-3 ${
              i > 0 ? "border-t border-line" : ""
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {tk.title}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                {tk.due ? (
                  <span className={overdue ? "font-medium text-urgent" : "text-muted"}>
                    {overdue ? `${t("tasks.overdue")} · ` : ""}
                    {formatDateTime(tk.due, locale)}
                  </span>
                ) : null}
                {onShabbos ? (
                  <span className="flex items-center gap-1 text-urgent">
                    <IconCandles size={13} />
                    {t("tasks.onShabbos")}
                  </span>
                ) : null}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onComplete(tk)}
              disabled={busyId === tk.id || pending}
              aria-label={t("tasks.complete")}
              className="pressable flex min-h-9 shrink-0 items-center gap-1 rounded-xl border border-line px-3 text-[13px] font-medium text-ink disabled:opacity-50"
            >
              <IconCheck size={15} />
              {t("tasks.done")}
            </button>
          </div>
        );
      })}
    </div>
  );
}
