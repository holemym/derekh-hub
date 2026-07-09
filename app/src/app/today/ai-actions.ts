"use server";

/**
 * Today's AI brief (ROADMAP M5) — on-demand, never on page load (an AI call
 * costs money and ~seconds; the operator taps the button when they want it).
 * Env-gated on ANTHROPIC_API_KEY; requires an active-staff session.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { openCasesByUrgency, listOpenTasks } from "@/lib/repo";
import { nextCandleLighting } from "@/lib/zmanim";
import { nextActionFor } from "@/lib/planning";
import { dailyBrief, type AiResult } from "@/lib/ai/copilot";

export async function aiDailyBrief(input: { locale: string }): Promise<AiResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: staff } = await supabase
    .from("staff")
    .select("id")
    .eq("id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (!staff) return { ok: false, error: "Not signed in." };

  const now = new Date();
  const [cases, tasks] = await Promise.all([openCasesByUrgency(now), listOpenTasks()]);
  const candle = nextCandleLighting(now);

  const lines: string[] = [
    `Now: ${now.toISOString()} (Vienna operation)`,
    candle
      ? `Next candle-lighting (Shabbos/chag starts): ${candle.toISOString()}`
      : "Next candle-lighting: unknown",
    "",
    `Open cases (${cases.length}), urgency-sorted:`,
    ...cases.map((c) => {
      const next = nextActionFor(c, now);
      return `- ${c.secularName || c.hebrewName} · stage ${c.status}${c.urgent ? " · URGENT" : ""} · next action key: ${next.key}${next.due ? ` · due ${next.due}` : ""}`;
    }),
    "",
    `Open tasks (${tasks.length}):`,
    ...tasks.map(
      (t) => `- ${t.title}${t.due ? ` (due ${t.due})` : ""}${t.caseId ? " [case-linked]" : ""}`,
    ),
  ];

  return dailyBrief({ briefContext: lines.join("\n"), locale: input.locale });
}
