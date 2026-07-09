"use server";

/**
 * Comms server actions (ROADMAP M4 + M4.5) — family status updates.
 *
 * Two paths, one history:
 *  - HAND-OFF (always available): the client opens a prefilled wa.me / mailto
 *    link; when the operator confirms they sent it, `logMessageSent` records a
 *    `messages` row.
 *  - REAL SEND (env-gated, M4.5): when SMTP / WhatsApp Cloud API keys are
 *    present, `sendMessageNow` sends server-side via @/lib/send and records the
 *    same row — so history is identical either way.
 *
 * Runs under the RLS-scoped server client — staff INSERT on messages (0002).
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MessageChannel } from "@/lib/types";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/types";
import { sendEmail, sendWhatsApp, emailConfigured, whatsappConfigured } from "@/lib/send";
import { toWaDigits } from "@/lib/comms";
import type { MessageInsert, ActivityLogInsert } from "../../../../../../db/types";

export interface CommsResult {
  ok: boolean;
  error?: string;
}

function isChannel(v: unknown): v is MessageChannel {
  return v === "whatsapp" || v === "email" || v === "sms";
}

interface MessageInput {
  caseId: string;
  channel: string;
  templateKey?: string;
  recipient?: string;
  body: string;
}

/** Validate + record a message row and its audit entry (shared by both paths). */
async function recordMessage(
  input: MessageInput,
  sentVia: "handoff" | "server",
): Promise<CommsResult> {
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
    detail: { channel: input.channel, template_key: templateKey, via: sentVia },
  };
  await supabase.from("activity_log").insert(log as never);

  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}

/**
 * Log a family update the operator sent by hand (wa.me / mailto hand-off).
 * Records channel, template_key, recipient, the rendered body, sent_at=now.
 */
export async function logMessageSent(input: MessageInput): Promise<CommsResult> {
  return recordMessage(input, "handoff");
}

/**
 * REALLY send a family update server-side (M4.5) — email via SMTP or WhatsApp
 * via the Cloud API, whichever is configured — then record the same message
 * row. RLS still applies: the record insert runs under the staff session, so a
 * non-staff caller cannot reach the send either (we check auth first).
 */
export async function sendMessageNow(
  input: MessageInput & { subject?: string },
): Promise<CommsResult> {
  if (!isChannel(input.channel)) return { ok: false, error: "Unknown channel." };
  const recipient = (input.recipient ?? "").trim();
  if (!recipient) return { ok: false, error: "No recipient on file." };

  // Gate on a real staff session BEFORE touching a provider.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let sent: { ok: boolean; error?: string };
  if (input.channel === "email") {
    if (!emailConfigured()) return { ok: false, error: "Email is not configured." };
    sent = await sendEmail({
      to: recipient,
      subject: (input.subject ?? "").trim() || "Update",
      text: input.body,
    });
  } else if (input.channel === "whatsapp") {
    if (!whatsappConfigured())
      return { ok: false, error: "WhatsApp is not configured." };
    sent = await sendWhatsApp({ to: toWaDigits(recipient), body: input.body });
  } else {
    return { ok: false, error: "SMS sending is not supported yet." };
  }
  if (!sent.ok) return { ok: false, error: sent.error };

  return recordMessage({ ...input, recipient }, "server");
}
