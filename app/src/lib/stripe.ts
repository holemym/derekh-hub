import "server-only";

/**
 * Stripe seam (ROADMAP M4.5) — payment links for invoices, plain fetch (no SDK
 * dep). Env-gated: STRIPE_SECRET_KEY enables "Payment link" on sent invoices;
 * STRIPE_WEBHOOK_SECRET enables the /api/stripe/webhook reconcile that marks
 * them paid automatically.
 *
 * Flow: create a one-off Price (inline product), then a Payment Link carrying
 * metadata.invoice_id. Payment Links copy their metadata onto the Checkout
 * Sessions they spawn, so the checkout.session.completed webhook can find the
 * invoice again. The link URL is stored in invoices.stripe_ref (schema 0001
 * anticipated this).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripePost(
  path: string,
  form: Record<string, string>,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (data.error as { message?: string } | undefined)?.message;
    return { ok: false, error: `Stripe ${res.status}: ${err ?? "request failed"}` };
  }
  return { ok: true, data };
}

/**
 * Create a hosted payment link for one invoice. Returns the permanent URL.
 * `description` becomes the line the payer sees (e.g. "Invoice INV-2026-0007 —
 * burial & repatriation service").
 */
export async function createPaymentLink(input: {
  invoiceId: string;
  caseId: string;
  amountCents: number;
  currency: string;
  description: string;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!stripeConfigured()) return { ok: false, error: "Stripe is not configured." };
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0)
    return { ok: false, error: "Invoice amount must be positive." };

  const price = await stripePost("/prices", {
    currency: input.currency.toLowerCase(),
    unit_amount: String(input.amountCents),
    "product_data[name]": input.description.slice(0, 250),
  });
  if (!price.ok) return { ok: false, error: price.error };

  const link = await stripePost("/payment_links", {
    "line_items[0][price]": String(price.data!.id),
    "line_items[0][quantity]": "1",
    "metadata[invoice_id]": input.invoiceId,
    "metadata[case_id]": input.caseId,
  });
  if (!link.ok) return { ok: false, error: link.error };

  return { ok: true, url: String(link.data!.url) };
}

/**
 * Verify a Stripe webhook signature (the `stripe-signature` header) against the
 * raw request body — HMAC-SHA256 of `${t}.${body}` with the endpoint secret,
 * constant-time compare, 5-minute timestamp tolerance.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  toleranceSeconds = 300,
): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const parts = new Map(
    signatureHeader.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)] as const;
    }),
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) return false;

  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`, "utf8")
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
