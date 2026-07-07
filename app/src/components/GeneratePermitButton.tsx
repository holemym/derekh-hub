"use client";

/**
 * Generate the real Israeli MFA transfer permit for a case — fully client-side
 * (offline-capable), the core of ROADMAP M1.
 *
 * On click:
 *   1. fetch the blank form from /forms/il-mfa-transfer-permit.pdf as bytes,
 *   2. build the permit context from the Case (buildPermitContext),
 *   3. validate() — surface any issues inline (e.g. Hebrew in a Latin field),
 *      but still let the operator proceed (mirrors the live tool),
 *   4. generate() the filled PDF and trigger a download.
 *
 * No network beyond the static blank PDF (which the service worker caches), so
 * this works at the consulate/airport with no signal — PLANNING §3.
 */

import { useState } from "react";
import { generate, validate } from "@derech/doc-engine";
import type { FormTemplate, ValidationIssue } from "@derech/doc-engine";
import type { Case } from "@/lib/types";
import { buildPermitContext } from "@/lib/documents/context";
import template from "@/lib/documents/templates/il-mfa-transfer-permit.json";
import { IconDoc, IconCheck } from "@/components/icons";

const FORM_URL = "/forms/il-mfa-transfer-permit.pdf";

function filenameFor(c: Case): string {
  const last =
    c.secularName.trim().split(/\s+/).pop()?.replace(/[^A-Za-z0-9]/g, "") ||
    "case";
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `burial-permit_${last}_${date}.pdf`;
}

export default function GeneratePermitButton({ c }: { c: Case }) {
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const tpl = template as unknown as FormTemplate;
      const data = buildPermitContext(c) as unknown as Record<string, unknown>;

      // Validate first; show issues but don't block (mirror the live tool).
      const result = validate(tpl, data);
      setIssues(result.issues);

      // generateDetailed/generate throws on ENCODING issues (non-WinAnsi text)
      // before drawing. Everything else (missing/overflow) is non-fatal.
      const res = await fetch(FORM_URL);
      if (!res.ok) throw new Error(`Could not load blank form (${res.status})`);
      const pdfBytes = new Uint8Array(await res.arrayBuffer());

      const filled = await generate(tpl, pdfBytes, data);

      const blob = new Blob([filled as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFor(c);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (e) {
      const err = e as Error & { issues?: ValidationIssue[] };
      if (err.issues?.length) setIssues(err.issues);
      setError(err.message || "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  const encodingIssues = issues.filter((i) => i.kind === "encoding");
  const otherIssues = issues.filter((i) => i.kind !== "encoding");

  return (
    <div className="overflow-hidden rounded-card border border-line bg-card">
      <div className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <IconDoc size={18} className="shrink-0 text-muted" />
          <span className="truncate text-sm font-medium">
            IL MFA transfer permit
          </span>
        </span>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="pressable flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg disabled:opacity-60"
        >
          {done ? <IconCheck size={15} /> : null}
          {busy ? "Generating…" : done ? "Generated" : "Generate permit"}
        </button>
      </div>

      {error ? (
        <p className="border-t border-line px-4 py-2.5 text-[13px] font-medium text-urgent">
          {error}
        </p>
      ) : null}

      {encodingIssues.length > 0 ? (
        <div className="border-t border-line px-4 py-2.5">
          <p className="text-[13px] font-medium text-urgent">
            Some values can’t be printed on this Latin-only form:
          </p>
          <ul className="mt-1 list-disc pl-5 text-[12px] text-muted">
            {encodingIssues.map((i) => (
              <li key={i.key}>{i.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {otherIssues.length > 0 ? (
        <div className="border-t border-line px-4 py-2.5">
          <ul className="list-disc pl-5 text-[12px] text-muted">
            {otherIssues.map((i) => (
              <li key={i.key}>{i.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
