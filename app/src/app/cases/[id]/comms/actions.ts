"use server";

/**
 * Comms server actions (ROADMAP M4) — family status-update logging.
 *
 * We have NO messaging provider (no WhatsApp Business API, no SMTP), so nothing
 * is sent from the server. The client composes a body from a template + builds
 * a hand-off link (wa.me / mailto) the operator opens in their own app. When
 * the operator confirms they sent it, this action LOGS a `messages` row so the
 * history is accurate.
 *
 * Runs under the RLS-scoped server client — staff INSERT on messages (0002).
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MessageChannel } from "@/lib/types";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/types";
import type { MessageInsert, ActivityLogInsert } from "../../../../../../db/types";

export interface CommsResult {
  ok: boolean;
  error?: string;
}

function isChannel(v: unknown): v is MessageChannel {
  return v === "whatsapp" || v === "email" || v === "sms";
}

/**
 * Log a sent family update. Records channel, template_key, recipient (the phone
 * / email actually used), the rendered body, and sent_at=now.
 */
export async function logMessageSent(input: {
  caseId: string;
  channel: string;
  templateKey?: string;
  recipient?: string;
  body: string;
}): Promise<CommsResult> {
  const { caseId } = input;
  if (!caseId) return { ok: false, error: "Missing case id." };
  if (!isChannel(input.channel)) return { ok: false, error: "Unknown channel." };
  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, error: "Nothing to send." };

  const templateKey =
    input.templateKey && (MESSAGE_TEMPLATE_KEYS as readonly string[]).includes(input.templateKey)
      ? input.templateKey
      : null;

  const now = new Date().toISOString();
  const payload: MessageInsert = {
    case_id: caseId,
    channel: input.channel,
    template_key: templateKey,
    recipient: (input.recipient ?? "").trim() || null,
    body,
    sent_at: now,
  };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("messages").insert(payload as never);
  if (error) return { ok: false, error: `Could not log the message: ${error.message}` };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let label: string | null = null;
  if (user) {
    const { data: staff } = await supabase
      .from("staff")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();
    label = (staff as { name: string } | null)?.name ?? null;
  }
  const log: ActivityLogInsert = {
    case_id: caseId,
    actor: user?.id ?? null,
    actor_label: label,
    action: "message_sent",
    detail: { channel: input.channel, template_key: templateKey },
  };
  await supabase.from("activity_log").insert(log as never);

  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}
