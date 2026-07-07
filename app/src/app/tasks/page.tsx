import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { listOpenTasks } from "@/lib/repo";
import { sortTasksByDue } from "@/lib/planning";
import TasksList from "@/components/TasksList";
import { IconChevronRight } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * Lightweight all-tasks view (ROADMAP M2). Every open task — case-linked and
 * standalone — plus an add-a-standalone-task control. Reachable from More.
 */
export default async function TasksPage() {
  const t = await getTranslations();
  const tasks = sortTasksByDue(await listOpenTasks());

  return (
    <div>
      <Link
        href="/more"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted"
      >
        <IconChevronRight size={16} className="rotate-180" />
        {t("more.title")}
      </Link>

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        {t("tasks.title")}
      </h1>
      <p className="mb-5 text-sm text-muted">{t("tasks.subtitle")}</p>

      <TasksList tasks={tasks} />
    </div>
  );
}
