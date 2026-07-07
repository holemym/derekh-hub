"use client";

/**
 * Per-case task list (ROADMAP M2). Lists this case's open tasks (due-sorted),
 * with an add-task control and complete / cancel per task. All privileged work
 * happens in server actions (@/app/tasks/actions) under the RLS-scoped staff
 * session; this component only collects input and reflects results.
 *
 * Scheduling awareness: a task whose due date falls on Shabbos/chag shows a
 * subtle "falls on Shabbos" note (zmanim-derived) — advisory, never a block.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { Task } from "@/lib/types";
import { createTask, completeTask, cancelTask } from "@/app/tasks/actions";
import { fallsOnShabbosOrChag } from "@/lib/planning";
import { formatDateTime } from "@/lib/format";
import { IconPlus, IconCheck, IconCandles } from "@/components/icons";

export default function CaseTasks({
  caseId,
  tasks,
}: {
  caseId: string;
  tasks: Task[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const open = tasks.filter((tk) => tk.status === "open");

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    // <input type="datetime-local"> yields "YYYY-MM-DDTHH:mm" (local/Vienna).
    const dueIso = due ? new Date(due).toISOString() : undefined;
    startTransition(async () => {
      const res = await createTask({ caseId, title: cleanTitle, due: dueIso });
      if (!res.ok) {
        setError(res.error ?? t("tasks.errorCreate"));
        return;
      }
      setTitle("");
      setDue("");
      setAdding(false);
      router.refresh();
    });
  }

  function onComplete(tk: Task) {
    setError(null);
    setBusyId(tk.id);
    startTransition(async () => {
      const res = await completeTask({ id: tk.id, caseId });
      setBusyId(null);
      if (!res.ok) {
        setError(res.error ?? t("tasks.errorUpdate"));
        return;
      }
      router.refresh();
    });
  }

  function onCancel(tk: Task) {
    if (!window.confirm(t("tasks.confirmCancel"))) return;
    setError(null);
    setBusyId(tk.id);
    startTransition(async () => {
      const res = await cancelTask({ id: tk.id, caseId });
      setBusyId(null);
      if (!res.ok) {
        setError(res.error ?? t("tasks.errorUpdate"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {open.length > 0 ? (
        <div className="overflow-hidden rounded-card border border-line bg-card">
          {open.map((tk, i) => {
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
                  {tk.due ? (
                    <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                      {formatDateTime(tk.due, locale)}
                      {onShabbos ? (
                        <span className="flex items-center gap-1 text-urgent">
                          <IconCandles size={13} />
                          {t("tasks.onShabbos")}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
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
      ) : null}

      {adding ? (
        <form
          onSubmit={onAdd}
          className="rounded-card border border-line bg-card px-4 py-3"
        >
          <input
            autoFocus
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
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setTitle("");
                setDue("");
              }}
              className="pressable min-h-10 shrink-0 rounded-xl border border-line px-3 text-[13px] font-medium text-muted"
            >
              {t("tasks.cancel")}
            </button>
          </div>
          {due && fallsOnShabbosOrChag(new Date(due).toISOString()) ? (
            <p className="mt-2 flex items-center gap-1 text-[12px] font-medium text-urgent">
              <IconCandles size={13} />
              {t("tasks.onShabbosHint")}
            </p>
          ) : null}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="pressable flex min-h-11 items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-card px-4 text-sm font-medium text-muted"
        >
          <IconPlus size={16} />
          {t("tasks.addTask")}
        </button>
      )}

      {error ? (
        <p className="px-1 text-[13px] font-medium text-urgent">{error}</p>
      ) : null}
    </div>
  );
}
