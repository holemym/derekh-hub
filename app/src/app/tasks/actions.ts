"use server";

/**
 * Task server actions (ROADMAP M2 planning layer).
 *
 * Every action runs under the RLS-scoped server client (@supabase/ssr), i.e.
 * the logged-in staff session, so the tasks table policies (0002) govern them:
 *   • staff → INSERT / UPDATE (create, complete, cancel via soft-status).
 * A non-staff/anon caller is invisible to RLS and every call fails safe.
 *
 * Tasks may be per-case (`caseId`) or standalone (`caseId` omitted). We store a
 * calendar_note when the due date falls on Shabbos/chag so the flag is durable,
 * but we never hard-block a Shabbos due date — the operator decides.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fallsOnShabbosOrChag } from "@/lib/planning";
import type { TaskInsert } from "../../../../db/types";

export interface TaskResult {
  ok: boolean;
  error?: string;
}

/** Empty string → null. */
function nn(v: string | undefined | null): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/**
 * Create a task. `title` is required; `caseId`, `due` (ISO datetime) and
 * `calendarNote` are optional. If `due` falls on Shabbos/chag and no explicit
 * note was passed, we stamp an advisory calendar_note (non-blocking).
 */
export async function createTask(input: {
  caseId?: string;
  title: string;
  due?: string;
  calendarNote?: string;
}): Promise<TaskResult> {
  const title = nn(input.title);
  if (!title) return { ok: false, error: "A task needs a title." };

  const due = nn(input.due);
  let calendarNote = nn(input.calendarNote);
  if (due && !calendarNote && fallsOnShabbosOrChag(due)) {
    calendarNote = "falls on Shabbos";
  }

  const supabase = await createSupabaseServerClient();

  const insert: TaskInsert = {
    case_id: nn(input.caseId),
    title,
    due,
    status: "open",
    calendar_note: calendarNote,
  };

  // db/types.ts predates postgrest-js 2.x GenericSchema, so the typed client
  // degrades .insert() params to never[]. The payload IS typed above; cast the
  // final arg only. (Same rationale as cases/new/actions.ts.)
  const { error } = await supabase.from("tasks").insert(insert as never);
  if (error) return { ok: false, error: `Could not create task: ${error.message}` };

  if (input.caseId) revalidatePath(`/cases/${input.caseId}`);
  revalidatePath("/today");
  revalidatePath("/tasks");
  return { ok: true };
}

/** Mark a task done (staff UPDATE — no hard delete). */
export async function completeTask(input: {
  id: string;
  caseId?: string;
}): Promise<TaskResult> {
  if (!input.id) return { ok: false, error: "Missing task." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: "done" } as never)
    .eq("id", input.id);
  if (error) return { ok: false, error: `Could not complete task: ${error.message}` };

  if (input.caseId) revalidatePath(`/cases/${input.caseId}`);
  revalidatePath("/today");
  revalidatePath("/tasks");
  return { ok: true };
}

/** Cancel a task (staff UPDATE → status 'cancelled', reversible, no delete). */
export async function cancelTask(input: {
  id: string;
  caseId?: string;
}): Promise<TaskResult> {
  if (!input.id) return { ok: false, error: "Missing task." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: "cancelled" } as never)
    .eq("id", input.id);
  if (error) return { ok: false, error: `Could not cancel task: ${error.message}` };

  if (input.caseId) revalidatePath(`/cases/${input.caseId}`);
  revalidatePath("/today");
  revalidatePath("/tasks");
  return { ok: true };
}
