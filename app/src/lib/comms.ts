/**
 * Family status-update messages (ROADMAP M4) — template rendering + hand-off
 * link builders. Pure; no network.
 *
 * We have NO messaging provider keys (no WhatsApp Business API, no SMTP), so we
 * DO NOT send anything automatically. Instead each composed message becomes a
 * prefilled hand-off link the operator opens in their own WhatsApp / mail
 * client:
 *   • WhatsApp → https://wa.me/<digits>?text=<urlencoded body>
 *   • Email    → mailto:<addr>?subject=<enc>&body=<enc>
 * "Mark sent" then logs a messages row (channel, template_key, recipient, body,
 * sent_at=now) so the history reflects what was actually sent by hand.
 *
 * The template bodies themselves live in the i18n messages under
 * `comms.templates.<key>` (EN + DE, full parity) and take {family} + {niftar}
 * placeholders — this module only assembles links + phone normalization so the
 * body text stays translator-owned.
 */

import type { MessageTemplateKey } from "@/lib/types";

/**
 * Normalize a phone/WhatsApp value to E.164 digits for wa.me: strip everything
 * but digits, drop a leading '00' international prefix. Returns "" if nothing
 * usable remains (caller should then disable the WhatsApp hand-off).
 */
export function toWaDigits(raw: string | undefined | null): string {
  if (!raw) return "";
  let digits = raw.replace(/[^\d+]/g, "");
  digits = digits.replace(/^\+/, "");
  digits = digits.replace(/^00/, "");
  digits = digits.replace(/\D/g, "");
  return digits;
}

/** Build a wa.me hand-off link (no digits → a text-only wa.me/?text= share). */
export function buildWhatsAppLink(phone: string | undefined, body: string): string {
  const digits = toWaDigits(phone);
  const text = encodeURIComponent(body);
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}

/** Build a mailto: hand-off link with prefilled subject + body. */
export function buildMailtoLink(
  email: string | undefined,
  subject: string,
  body: string,
): string {
  const addr = email ? encodeURIComponent(email) : "";
  const q = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${addr}?${q}`;
}

/** All template keys in display order (mirrors MESSAGE_TEMPLATE_KEYS). */
export const COMMS_TEMPLATE_ORDER: readonly MessageTemplateKey[] = [
  "received",
  "documents_ready",
  "permit_issued",
  "in_transit",
  "arrived",
  "buried",
] as const;
