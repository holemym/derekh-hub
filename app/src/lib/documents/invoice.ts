/**
 * Invoice — a clean one-page PDF drawn directly with pdf-lib (ROADMAP M4).
 *
 * This is NOT an overlay of an official form: it is our own tidy invoice on the
 * pre-printed IKG Vienna funeral-service identity (issuer = "IKG Vienna",
 * Mordechai Hammer, Funeral Director — the same identity that is pre-printed on
 * the MFA transfer permit). The bill-to is the case's family contact when one is
 * linked; otherwise a neutral "The family of <niftar>" line is used.
 *
 * One clean layout: issuer block (top-left) + invoice meta (top-right: number,
 * issue date, due/paid), a bill-to block, a single service line ("Burial &
 * repatriation service — <niftar>") with the amount, a total, and a quiet
 * footer note. Helvetica / WinAnsi only, so any Hebrew is transliterated out
 * (mirrors manifest.ts + the permit engine's WinAnsi guard).
 *
 * Pure — no I/O. Runs in Node (server action) and, in principle, the browser;
 * zero framework deps beyond pdf-lib. The saving/download path mirrors
 * manifest.ts exactly (see cases/[id]/money/actions.ts → generateInvoicePdf).
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InvoiceStatus } from "../../../../db/types";

/** A4 portrait in PDF points (matches manifest.ts). */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 54;
const INK = rgb(0.09, 0.086, 0.06);
const MUTED = rgb(0.5, 0.49, 0.46);
const LINE = rgb(0.86, 0.85, 0.83);

/** The pre-printed IKG Vienna funeral-service identity (issuer). */
const ISSUER = {
  org: "IKG Vienna",
  line1: "Israelitische Kultusgemeinde Wien",
  line2: "Funeral Service · Bestattung",
  contact: "Mordechai Hammer · Funeral Director",
  address: "Seitenstettengasse 4, 1010 Vienna, Austria",
} as const;

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

export interface InvoiceLine {
  /** Service description (e.g. "Burial & repatriation service"). */
  description: string;
  /** Line amount in cents. */
  amountCents: number;
}

export interface InvoiceInput {
  /** Invoice number as printed (e.g. "INV-2026-0007"). */
  number: string;
  status: InvoiceStatus;
  /** ISO issue date (defaults to now). */
  issuedAt?: string;
  /** ISO paid date, when status is 'paid'. */
  paidAt?: string;
  currency?: string; // default 'EUR'
  /** Whom the invoice is addressed to (family contact, or a neutral fallback). */
  billTo: {
    name?: string;
    org?: string;
    address?: string;
    email?: string;
    phone?: string;
  };
  /** The niftar this case concerns (secular name preferred; Hebrew dropped). */
  niftar: {
    hebrewName?: string;
    secularName?: string;
  };
  lines: InvoiceLine[];
  /** Human reference for the case (short id). */
  reference?: string;
}

/** Drop any character pdf-lib's WinAnsi Helvetica can't encode (e.g. Hebrew). */
function toWinAnsi(s: string | undefined | null): string {
  if (!s) return "";
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code <= 0x7e) out += ch; // ASCII
    else if (code >= 0xa0 && code <= 0xff) out += ch; // Latin-1 supplement
    // else dropped (Hebrew, emoji, …)
  }
  return out.trim();
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** cents → "€ 1,234.56" (or the given currency symbol/code). */
function fmtMoney(cents: number, currency = "EUR"): string {
  const value = (cents / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const symbol = currency === "EUR" ? "€" : `${currency} `;
  return `${symbol} ${value}`.trim();
}

/** Draw a text run, hard-truncating to fit maxWidth (char-by-char). */
function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color = INK,
  maxWidth?: number,
): void {
  let t = toWinAnsi(text);
  if (maxWidth) {
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxWidth) {
      t = t.slice(0, -1);
    }
  }
  page.drawText(t, { x, y, size, font, color });
}

/** Right-align a text run ending at x=right. */
function drawRight(
  page: PDFPage,
  font: PDFFont,
  text: string,
  right: number,
  y: number,
  size: number,
  color = INK,
): void {
  const t = toWinAnsi(text);
  drawText(page, font, t, right - font.widthOfTextAtSize(t, size), y, size, color);
}

/**
 * Build the invoice PDF; returns the raw bytes. Pure — no I/O.
 */
export async function buildInvoicePdf(input: InvoiceInput): Promise<Uint8Array> {
  const currency = input.currency ?? "EUR";
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${input.number}`);
  doc.setCreator("Derech · IKG Vienna");
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  const contentW = right - left;
  let y = PAGE_H - MARGIN;

  // ── Issuer (top-left) + INVOICE title (top-right) ─────────────────────────
  drawText(page, bold, ISSUER.org, left, y, 18);
  drawRight(page, bold, "INVOICE", right, y, 18, MUTED);
  y -= 16;
  drawText(page, regular, ISSUER.line1, left, y, 9, MUTED);
  y -= 12;
  drawText(page, regular, ISSUER.line2, left, y, 9, MUTED);
  y -= 12;
  drawText(page, regular, ISSUER.contact, left, y, 9, MUTED);
  y -= 12;
  drawText(page, regular, ISSUER.address, left, y, 9, MUTED);

  y = PAGE_H - MARGIN - 34;
  // Invoice meta rows, right-aligned under the title.
  const metaRows: Array<[string, string]> = [
    ["No.", toWinAnsi(input.number) || "—"],
    ["Issued", fmtDate(input.issuedAt ?? new Date().toISOString())],
    input.status === "paid"
      ? ["Paid", fmtDate(input.paidAt)]
      : ["Status", STATUS_LABEL[input.status]],
  ];
  for (const [k, v] of metaRows) {
    drawRight(page, regular, k, right - 110, y, 9, MUTED);
    drawRight(page, bold, v, right, y, 10);
    y -= 15;
  }

  y = PAGE_H - MARGIN - 96;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: INK });
  y -= 28;

  // ── Bill to ───────────────────────────────────────────────────────────────
  drawText(page, bold, "BILL TO", left, y, 9, MUTED);
  y -= 18;
  const bt = input.billTo;
  const niftarName = toWinAnsi(input.niftar.secularName) || "the deceased";
  const billName =
    toWinAnsi(bt.name) || `The family of ${niftarName}`;
  drawText(page, bold, billName, left, y, 12);
  y -= 15;
  const billLines = [bt.org, bt.address, bt.email, bt.phone]
    .map((s) => toWinAnsi(s))
    .filter(Boolean);
  for (const l of billLines) {
    drawText(page, regular, l, left, y, 9.5, MUTED, contentW);
    y -= 13;
  }
  y -= 12;

  // ── Line items table ────────────────────────────────────────────────────
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: LINE });
  y -= 16;
  drawText(page, bold, "DESCRIPTION", left, y, 8.5, MUTED);
  drawRight(page, bold, "AMOUNT", right, y, 8.5, MUTED);
  y -= 8;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: LINE });
  y -= 20;

  let total = 0;
  for (const line of input.lines) {
    total += line.amountCents;
    drawText(page, regular, line.description, left, y, 11, INK, contentW - 120);
    drawRight(page, regular, fmtMoney(line.amountCents, currency), right, y, 11);
    y -= 22;
  }

  y -= 2;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: LINE });
  y -= 22;

  // ── Total ─────────────────────────────────────────────────────────────────
  drawRight(page, bold, "Total", right - 130, y, 12, MUTED);
  drawRight(page, bold, fmtMoney(total, currency), right, y, 13);
  y -= 30;

  if (input.status === "paid") {
    drawRight(page, bold, `Paid ${fmtDate(input.paidAt)}`, right, y, 10, MUTED);
    y -= 20;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footY = MARGIN + 46;
  page.drawLine({
    start: { x: left, y: footY },
    end: { x: right, y: footY },
    thickness: 0.5,
    color: LINE,
  });
  drawText(
    page,
    regular,
    "Thank you. For questions about this invoice, please contact the funeral service.",
    left,
    footY - 16,
    8.5,
    MUTED,
    contentW,
  );
  const ref = input.reference ? `Ref ${toWinAnsi(input.reference)}` : "";
  if (ref) drawRight(page, regular, ref, right, footY - 16, 8.5, MUTED);
  drawText(page, regular, `${ISSUER.org} · ${ISSUER.contact}`, left, footY - 30, 8.5, MUTED);

  return doc.save({ useObjectStreams: false });
}
