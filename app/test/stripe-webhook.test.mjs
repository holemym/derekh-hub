/**
 * M4.5 unit test — Stripe webhook signature verification (pure crypto).
 *
 * JS MIRROR of verifyStripeSignature in src/lib/stripe.ts (Node can't resolve
 * the app's "@/" alias / server-only import without a loader). If you change
 * the verifier, mirror the change here.
 *
 * Asserts: a correctly signed payload verifies; a tampered body, a stale
 * timestamp, a wrong secret, and a missing header all fail.
 *
 * Usage (from app/):  node test/stripe-webhook.test.mjs
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import assert from "node:assert/strict";

/* ── mirror of src/lib/stripe.ts verifyStripeSignature ─────────────────── */

function verify(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  if (!secret || !signatureHeader) return false;
  const parts = new Map(
    signatureHeader.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)];
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

/* ── tests ──────────────────────────────────────────────────────────────── */

const SECRET = "whsec_test_123";
const body = JSON.stringify({ type: "checkout.session.completed", data: {} });

function sign(payload, secret, ts = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret).update(`${ts}.${payload}`, "utf8").digest("hex");
  return `t=${ts},v1=${sig}`;
}

let n = 0;
const ok = (name, cond) => {
  n++;
  assert.ok(cond, name);
  console.log(`PASS  ${name}`);
};

ok("valid signature verifies", verify(body, sign(body, SECRET), SECRET) === true);
ok("tampered body fails", verify(body + "x", sign(body, SECRET), SECRET) === false);
ok("wrong secret fails", verify(body, sign(body, "whsec_other"), SECRET) === false);
ok(
  "stale timestamp fails",
  verify(body, sign(body, SECRET, Math.floor(Date.now() / 1000) - 3600), SECRET) === false,
);
ok("missing header fails", verify(body, null, SECRET) === false);
ok("missing secret fails", verify(body, sign(body, SECRET), "") === false);
ok("garbage header fails", verify(body, "t=,v1=", SECRET) === false);

console.log(`\n${n} assertions passed.`);
