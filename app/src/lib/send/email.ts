import "server-only";

/**
 * Email sending seam (ROADMAP M4.5) — plain SMTP via nodemailer, so any
 * provider works (Gmail workspace, Postmark, Brevo, IKG's own relay…).
 *
 * Env-gated: without SMTP_* keys the app quietly falls back to mailto hand-off
 * links (CaseComms). Keys, all required unless noted:
 *   SMTP_HOST · SMTP_USER · SMTP_PASS · SMTP_FROM ("Derech <ops@…>")
 *   SMTP_PORT (optional, default 587; 465 switches to implicit TLS)
 *
 * NOTE this is the app's outbound mail (family updates, consulate email). The
 * magic-link LOGIN mail is sent by Supabase Auth — configure custom SMTP for
 * that in the Supabase dashboard (see DEPLOY.md §providers).
 */

import nodemailer from "nodemailer";

export function emailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM,
  );
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

/** Send one plain-text email. Returns { ok:false } instead of throwing. */
export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<SendResult> {
  if (!emailConfigured()) return { ok: false, error: "Email is not configured." };
  const port = Number(process.env.SMTP_PORT || 587);
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed." };
  }
}
