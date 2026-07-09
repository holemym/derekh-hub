"use server";

/**
 * Case-level AI copilot actions (ROADMAP M5). Env-gated on ANTHROPIC_API_KEY.
 *
 * Each action re-reads the case through the RLS-scoped repo AND explicitly
 * requires an active-staff session first — an AI call costs real money, so we
 * gate before spending, not just on the DB read.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCase, contactCardsForCase, tasksForCase } from "@/lib/repo";
import {
  draftConsulateEmail,
  summarizeCase,
  type AiResult,
} from "@/lib/ai/copilot";
import type { Case, CaseContactCard, Task } from "@/lib/types";

/** True only for a signed-in ACTIVE staff member (RLS lets you read own row). */
async function isActiveStaff(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("staff")
    .select("id")
    .eq("id", user.id)
    .eq("active", true)
    .maybeSingle();
  return !!data;
}

/** Compact plain-text case context for prompts (only what the task needs). */
function caseContext(c: Case, contacts: CaseContactCard[], tasks: Task[]): string {
  const lines: string[] = [
    `Deceased: ${c.secularName || "?"} (Hebrew name: ${c.hebrewName || "?"})`,
    `Date of birth: ${c.dob ?? "?"} · Place of birth: ${c.placeOfBirth ?? "?"}`,
    `Date of death: ${c.dod} · Place of death: ${c.placeOfDeath}`,
    `Nationality: ${c.nationality || "?"} · Passport/ID: ${c.idOrPassport ?? "?"}`,
    `Last address: ${c.lastAddress ?? "?"}`,
    `Pipeline stage: ${c.status}${c.urgent ? " (URGENT)" : ""}`,
    `Cemetery/burial place: ${[c.cemetery, c.burialPlace].filter(Boolean).join(", ") || "?"}`,
  ];
  if (c.transportLegs.length > 0) {
    lines.push(
      "Transport: " +
        c.transportLegs
          .map((l) => `${l.type} ${l.from}→${l.to} (${l.status}${l.flightOrAwb ? `, ${l.flightOrAwb}` : ""})`)
          .join("; "),
    );
  }
  if (contacts.length > 0) {
    lines.push(
      "Contacts: " +
        contacts.map((cc) => `${cc.role}: ${cc.name}${cc.email ? ` <${cc.email}>` : ""}`).join("; "),
    );
  }
  const open = tasks.filter((t) => t.status === "open");
  if (open.length > 0) {
    lines.push("Open tasks: " + open.map((t) => `${t.title}${t.due ? ` (due ${t.due})` : ""}`).join("; "));
  }
  const stages = Object.entries(c.stageTimestamps)
    .map(([s, at]) => `${s}@${at}`)
    .join(", ");
  if (stages) lines.push(`Stage history: ${stages}`);
  return lines.join("\n");
}

async function loadContext(caseId: string): Promise<
  | { ok: true; context: string; consulate?: CaseContactCard }
  | { ok: false; error: string }
> {
  if (!(await isActiveStaff())) return { ok: false, error: "Not signed in." };
  const c = await getCase(caseId);
  if (!c) return { ok: false, error: "Case not found." };
  const [contacts, tasks] = await Promise.all([
    contactCardsForCase(caseId),
    tasksForCase(caseId),
  ]);
  return {
    ok: true,
    context: caseContext(c, contacts, tasks),
    consulate: contacts.find((cc) => cc.role === "consulate"),
  };
}

/** Draft the consulate email for this case (returns the text; nothing saved). */
export async function aiDraftConsulateEmail(input: {
  caseId: string;
  locale: string;
}): Promise<AiResult & { recipientEmail?: string }> {
  const ctx = await loadContext(input.caseId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const res = await draftConsulateEmail({
    caseContext: ctx.context,
    consulateName: ctx.consulate?.name,
    locale: input.locale,
  });
  return { ...res, recipientEmail: ctx.consulate?.email };
}

/** Short operational summary of this case. */
export async function aiSummarizeCase(input: {
  caseId: string;
  locale: string;
}): Promise<AiResult> {
  const ctx = await loadContext(input.caseId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  return summarizeCase({ caseContext: ctx.context, locale: input.locale });
}
