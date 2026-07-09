import "server-only";

/**
 * WhatsApp sending seam (ROADMAP M4.5) — Meta's WhatsApp Business Cloud API,
 * plain fetch (no SDK). Env-gated: without keys the app falls back to wa.me
 * hand-off links (CaseComms).
 *
 * Keys: WHATSAPP_TOKEN (permanent system-user token) + WHATSAPP_PHONE_ID
 * (the business phone-number id, NOT the phone number).
 *
 * Cloud API constraint worth knowing: a free-form TEXT message only delivers
 * inside the 24h customer-service window (i.e. after the family last messaged
 * the business). Outside it, WhatsApp requires a pre-approved template. Family
 * comms here usually follow an inbound conversation, so text is the pragmatic
 * default; if delivery fails, the operator still has the wa.me hand-off.
 */

import type { SendResult } from "./email";

const GRAPH = "https://graph.facebook.com/v21.0";

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

/** Send one free-form text message to a phone (digits, country code, no +). */
export async function sendWhatsApp(input: {
  to: string;
  body: string;
}): Promise<SendResult> {
  if (!whatsappConfigured())
    return { ok: false, error: "WhatsApp is not configured." };
  try {
    const res = await fetch(
      `${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: input.to,
          type: "text",
          text: { body: input.body },
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `WhatsApp API ${res.status}: ${detail.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed." };
  }
}
