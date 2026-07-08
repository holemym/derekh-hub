"use client";

/**
 * Standalone all-tasks list (ROADMAP M2 /tasks). Adds a standalone task (no
 * case) and lists every open task with complete / cancel. A case-linked task
 * carries a subtle link back to its case. All writes go through the RLS-scoped
 * server actions. Scheduling: a due date on Shabbos/chag is flagged, never
 * blocked.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import type { Task } from "@/lib/types";
import { createTask, completeTask, cancelTask } from "@/app/tasks/actions";
import { fallsOnShabbosOrChag, isOverdue } from "@/lib/planning";
import { formatDateTime } from "@/lib/format";
import { IconPlus, IconCheck, IconCandles } from "@/components/icons";

export default function TasksList({ tasks }: { tasks: Task[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const now = new Date();

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const dueIso = due ? new Date(due).toISOString() : undefined;
    startTransition(async () => {
      const res = await createTask({ title: cleanTitle, due: dueIso });
      if (!res.ok) {
        setError(res.error ?? t("tasks.errorCreate"));
        return;
      }
      setTitle("");
      setDue("");
      router.refresh();
    });
  }

  function onComplete(tk: Task) {
    setBusyId(tk.id);
    startTransition(async () => {
      const res = await completeTask({ id: tk.id, caseId: tk.caseId });
      setBusyId(null);
      if (!res.ok) setError(res.error ?? t("tasks.errorUpdate"));
      else router.refresh();
    });
  }

  function onCancel(tk: Task) {
    if (!window.confirm(t("tasks.confirmCancel"))) return;
    setBusyId(tk.id);
    startTransition(async () => {
      const res = await cancelTask({ id: tk.id, caseId: tk.caseId });
      setBusyId(null);
      if (!res.ok) setError(res.error ?? t("tasks.errorUpdate"));
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add a standalone task */}
      <form onSubmit={onAdd} className="surface px-4 py-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("tasks.titlePlaceholder")}
          className="mb-2.5 min-h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"
        />
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label={t("tasks.due")}
            className="min-h-10 flex-1 rounded-xl border border-line bg-bg px-3 text-[13px] text-ink"
          />
          <button
            type="submit"
            disabled={pending || !title.trim()}
            className="pressable flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg disabled:opacity-60"
          >
            <IconPlus size={15} />
            {pending ? t("tasks.adding") : t("tasks.add")}
          </button>
        </div>
        {due && fallsOnShabbosOrChag(new Date(due).toISOString()) ? (
          <p className="mt-2 flex items-center gap-1 text-[12px] font-medium text-urgent">
            <IconCandles size={13} />
            {t("tasks.onShabbosHint")}
          </p>
        ) : null}
      </form>

      {tasks.length === 0 ? (
        <p className="py-10 text-center t-body text-muted">
          {t("tasks.empty")}
        </p>
      ) : (
        <div className="surface divide-y divide-line overflow-hidden">
          {tasks.map((tk) => {
            const overdue = isOverdue(tk, now);
            const onShabbos = fallsOnShabbosOrChag(tk.due);
            return (
              <div
                key={tk.id}
                className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate t-body font-medium">
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
                    {tk.caseId ? (
                      <Link
                        href={`/cases/${tk.caseId}`}
                        className="text-muted underline underline-offset-2"
                      >
                        {t("tasks.openCase")}
                      </Link>
                    ) : null}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onComplete(tk)}
                    disabled={busyId === tk.id || pending}
                    aria-label={t("tasks.complete")}
                    className="pressable flex min-h-9 items-center gap-1 rounded-xl border border-line px-3 text-[13px] font-medium text-ink disabled:opacity-50"
                  >
                    <IconCheck size={15} />
                    {t("tasks.done")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCancel(tk)}
                    disabled={busyId === tk.id || pending}
                    className="pressable min-h-9 rounded-xl border border-line px-3 text-[13px] font-medium text-muted disabled:opacity-50"
                  >
                    {t("tasks.cancel")}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {error ? (
        <p className="px-1 text-[13px] font-medium text-urgent">{error}</p>
      ) : null}
    </div>
  );
}
