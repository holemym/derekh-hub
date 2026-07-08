/**
 * Transport manifest — a generated one-page PDF drawn directly with pdf-lib
 * (ROADMAP M3). This is NOT an overlay of an official form: we have no blank
 * airline-cargo / known-shipper template yet, so the manifest is our own clean
 * one-pager. When a real carrier form arrives, feed it through the doc-engine
 * overlay path (@/lib/doc-engine) instead — see the follow-up note in the M3
 * report.
 *
 * The page lists the niftar identity, every transport leg (type / route /
 * carrier / flight-or-AWB / scheduled time / status) and the full chain of
 * custody. Helvetica / WinAnsi only, so Hebrew is transliterated out — the
 * Hebrew name is drawn as a label but any non-Latin glyphs are dropped to keep
 * pdf-lib's StandardFont happy (mirrors the permit engine's WinAnsi guard).
 *
 * Runs in Node (server action) and, in principle, the browser — zero framework
 * deps beyond pdf-lib.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { TransportLeg, TransportLegType, CustodyEventKind } from "@/lib/types";

/** A4 portrait in PDF points. */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 54;
const INK = rgb(0.09, 0.086, 0.06);
const MUTED = rgb(0.5, 0.49, 0.46);
const LINE = rgb(0.86, 0.85, 0.83);

const LEG_TYPE_LABEL: Record<TransportLegType, string> = {
  ground: "Ground",
  air_cargo: "Air cargo",
  domestic: "Domestic (IL)",
};

const CUSTODY_LABEL: Record<CustodyEventKind, string> = {
  collected: "Collected",
  handed_over: "Handed over",
  received: "Received",
  released: "Released",
};

const LEG_STATUS_LABEL: Record<TransportLeg["status"], string> = {
  planned: "Planned",
  booked: "Booked",
  in_transit: "In transit",
  completed: "Completed",
};

export interface ManifestNiftar {
  hebrewName?: string;
  secularName?: string;
  idOrPassport?: string;
  nationality?: string;
  dod?: string;
  placeOfDeath?: string;
  cemetery?: string;
  burialPlace?: string;
}

export interface ManifestInput {
  niftar: ManifestNiftar;
  legs: TransportLeg[];
  /** Human reference for the case (short id or case number). */
  reference?: string;
  /** ISO timestamp the manifest was generated (defaults to now). */
  generatedAt?: string;
}

/** Drop any character pdf-lib's WinAnsi Helvetica can't encode (e.g. Hebrew). */
function toWinAnsi(s: string | undefined | null): string {
  if (!s) return "";
  // Keep printable Latin-1; replace the rest with nothing.
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code <= 0x7e) out += ch; // ASCII
    else if (code >= 0xa0 && code <= 0xff) out += ch; // Latin-1 supplement
    // else: dropped (Hebrew, emoji, …)
  }
  return out.trim();
}

function fmtDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
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

/**
 * Build the manifest PDF; returns the raw bytes. Pure — no I/O.
 */
export async function buildManifestPdf(input: ManifestInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Transport manifest");
  doc.setCreator("Derech");
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  const contentW = right - left;
  let y = PAGE_H - MARGIN;

  // ── Header ───────────────────────────────────────────────────────────────
  drawText(page, bold, "Transport manifest", left, y, 20);
  drawText(
    page,
    regular,
    `Generated ${fmtDateTime(input.generatedAt ?? new Date().toISOString())}`,
    left,
    y - 18,
    9,
    MUTED,
  );
  drawText(page, bold, "DERECH", right - bold.widthOfTextAtSize("DERECH", 11), y, 11, MUTED);
  if (input.reference) {
    const ref = `Ref ${toWinAnsi(input.reference)}`;
    drawText(page, regular, ref, right - regular.widthOfTextAtSize(ref, 9), y - 16, 9, MUTED);
  }
  y -= 40;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: INK });
  y -= 26;

  // ── Niftar identity ────────────────────────────────────────────────────────
  drawText(page, bold, "DECEASED", left, y, 9, MUTED);
  y -= 18;
  const n = input.niftar;
  const secular = toWinAnsi(n.secularName) || "—";
  drawText(page, bold, secular, left, y, 14);
  // The Hebrew name won't encode in Helvetica; note it as a label if any Latin
  // remains, otherwise omit silently.
  y -= 22;

  const idRows: Array<[string, string]> = [
    ["ID / Passport", toWinAnsi(n.idOrPassport) || "—"],
    ["Nationality", toWinAnsi(n.nationality) || "—"],
    ["Date of death", fmtDateTime(n.dod)],
    ["Place of death", toWinAnsi(n.placeOfDeath) || "—"],
    ["Burial place", toWinAnsi(n.burialPlace || n.cemetery) || "—"],
  ];
  const colW = contentW / 2;
  for (let i = 0; i < idRows.length; i += 2) {
    const rowY = y;
    for (let c = 0; c < 2; c++) {
      const item = idRows[i + c];
      if (!item) continue;
      const cx = left + c * colW;
      drawText(page, regular, item[0], cx, rowY, 8, MUTED);
      drawText(page, regular, item[1], cx, rowY - 12, 10.5, INK, colW - 14);
    }
    y -= 32;
  }
  y -= 6;

  // ── Transport legs ─────────────────────────────────────────────────────────
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: LINE });
  y -= 20;
  drawText(page, bold, "TRANSPORT LEGS", left, y, 9, MUTED);
  y -= 20;

  if (input.legs.length === 0) {
    drawText(page, regular, "No transport legs recorded.", left, y, 10.5, MUTED);
    y -= 20;
  }

  input.legs.forEach((leg, i) => {
    const flight = toWinAnsi(leg.flightNo);
    const awb = toWinAnsi(leg.awbNo);
    const route = `${toWinAnsi(leg.from) || "?"}  →  ${toWinAnsi(leg.to) || "?"}`;

    drawText(page, bold, `${i + 1}.  ${LEG_TYPE_LABEL[leg.type]}`, left, y, 11);
    const statusLabel = LEG_STATUS_LABEL[leg.status];
    drawText(
      page,
      regular,
      statusLabel,
      right - regular.widthOfTextAtSize(statusLabel, 9),
      y,
      9,
      MUTED,
    );
    y -= 15;
    drawText(page, regular, route, left + 12, y, 10.5, INK, contentW - 12);
    y -= 14;

    const meta: string[] = [];
    if (leg.carrier) meta.push(`Carrier: ${toWinAnsi(leg.carrier)}`);
    if (flight) meta.push(`Flight ${flight}`);
    if (awb) meta.push(`AWB ${awb}`);
    meta.push(`Scheduled: ${fmtDateTime(leg.scheduledAt)}`);
    drawText(page, regular, meta.join("    ·    "), left + 12, y, 9, MUTED, contentW - 12);
    y -= 18;

    if (i < input.legs.length - 1) {
      page.drawLine({
        start: { x: left, y: y + 4 },
        end: { x: right, y: y + 4 },
        thickness: 0.5,
        color: LINE,
      });
      y -= 8;
    }
  });

  y -= 8;

  // ── Chain of custody (all legs, chronological within each) ─────────────────
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: LINE });
  y -= 20;
  drawText(page, bold, "CHAIN OF CUSTODY", left, y, 9, MUTED);
  y -= 20;

  const anyCustody = input.legs.some((l) => l.custodyChain.length > 0);
  if (!anyCustody) {
    drawText(page, regular, "No custody events recorded.", left, y, 10.5, MUTED);
    y -= 18;
  } else {
    input.legs.forEach((leg) => {
      if (leg.custodyChain.length === 0) return;
      drawText(
        page,
        regular,
        `Leg — ${toWinAnsi(leg.from) || "?"} → ${toWinAnsi(leg.to) || "?"}`,
        left,
        y,
        8.5,
        MUTED,
      );
      y -= 15;
      leg.custodyChain.forEach((ev) => {
        // dot
        page.drawCircle({ x: left + 5, y: y + 3, size: 2, color: INK });
        drawText(page, bold, CUSTODY_LABEL[ev.event], left + 14, y, 10);
        const when = fmtDateTime(ev.at);
        drawText(
          page,
          regular,
          when,
          right - regular.widthOfTextAtSize(when, 9),
          y,
          9,
          MUTED,
        );
        y -= 13;
        const detail = [ev.by ? `by ${toWinAnsi(ev.by)}` : "", toWinAnsi(ev.note)]
          .filter(Boolean)
          .join(" — ");
        if (detail) {
          drawText(page, regular, detail, left + 14, y, 9, MUTED, contentW - 14);
          y -= 13;
        }
        y -= 3;
      });
      y -= 6;
    });
  }

  // ── Signature footer ───────────────────────────────────────────────────────
  const footY = Math.max(y, MARGIN + 40);
  page.drawLine({
    start: { x: left, y: footY },
    end: { x: right, y: footY },
    thickness: 0.5,
    color: LINE,
  });
  drawText(page, regular, "Released by", left, footY - 16, 8.5, MUTED);
  page.drawLine({
    start: { x: left, y: footY - 34 },
    end: { x: left + 200, y: footY - 34 },
    thickness: 0.5,
    color: INK,
  });
  drawText(page, regular, "Received by", left + 260, footY - 16, 8.5, MUTED);
  page.drawLine({
    start: { x: left + 260, y: footY - 34 },
    end: { x: left + 460, y: footY - 34 },
    thickness: 0.5,
    color: INK,
  });

  return doc.save({ useObjectStreams: false });
}
