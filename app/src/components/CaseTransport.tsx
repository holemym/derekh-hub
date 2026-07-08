"use client";

/**
 * Per-case transport & repatriation (ROADMAP M3). Lists a case's transport
 * legs, each with an inline route + carrier + schedule, a one-tap advance
 * (planned → booked → in_transit → completed), a small chain-of-custody
 * timeline with an "add event" control, and an add/edit-leg form. A "Generate
 * manifest" action produces the one-page transport PDF (saved to the case docs
 * + a plain download).
 *
 * All privileged work happens in server actions (@/app/cases/[id]/transport/
 * actions) under the RLS-scoped staff session; this component only collects
 * input and reflects results.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { TransportLeg, TransportLegStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import {
  saveTransportLeg,
  advanceLegStatus,
  addCustodyEvent,
  generateTransportManifest,
} from "@/app/cases/[id]/transport/actions";
import { IconPlane, IconPlus, IconCheck, IconDoc } from "@/components/icons";

const LEG_TYPES = ["ground", "air_cargo", "domestic_il"] as const;
const CUSTODY_KINDS = ["collected", "handed_over", "received", "released"] as const;

/** app leg type ('domestic') → the DB/form value ('domestic_il'). */
function legTypeToForm(t: TransportLeg["type"]): (typeof LEG_TYPES)[number] {
  return t === "domestic" ? "domestic_il" : t;
}

/** ISO → the value <input type="datetime-local"> expects (local Vienna). */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Render in Vienna wall time, then reformat as YYYY-MM-DDTHH:mm.
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  // sv-SE gives "YYYY-MM-DD HH:mm" → swap the space for a T.
  return parts.replace(" ", "T");
}

function base64ToBlobUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

const STATUS_TONE: Record<TransportLegStatus, string> = {
  planned: "border-line text-muted",
  booked: "border-line text-ink",
  in_transit: "border-ink text-ink",
  completed: "border-line text-muted",
};

export default function CaseTransport({
  caseId,
  legs,
}: {
  caseId: string;
  legs: TransportLeg[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingLeg, setEditingLeg] = useState<string | null>(null); // legId | "new"
  const [custodyFor, setCustodyFor] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  function refresh() {
    router.refresh();
  }

  function onSaveLeg(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("caseId", caseId);
    // datetime-local → ISO (interpreted as Vienna-local by the browser env).
    const raw = String(fd.get("scheduledAt") ?? "");
    fd.set("scheduledAt", raw ? new Date(raw).toISOString() : "");
    startTransition(async () => {
      const res = await saveTransportLeg(fd);
      if (!res.ok) {
        setError(res.error ?? t("transport.errorSave"));
        return;
      }
      setEditingLeg(null);
      refresh();
    });
  }

  function onAdvance(leg: TransportLeg) {
    setError(null);
    setBusyId(leg.id);
    startTransition(async () => {
      const res = await advanceLegStatus({ caseId, legId: leg.id });
      setBusyId(null);
      if (!res.ok) {
        setError(res.error ?? t("transport.errorAdvance"));
        return;
      }
      refresh();
    });
  }

  function onAddCustody(e: React.FormEvent<HTMLFormElement>, legId: string) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const event = String(fd.get("event") ?? "");
    const rawAt = String(fd.get("at") ?? "");
    startTransition(async () => {
      const res = await addCustodyEvent({
        caseId,
        legId,
        event,
        at: rawAt ? new Date(rawAt).toISOString() : undefined,
        by: String(fd.get("by") ?? ""),
        note: String(fd.get("note") ?? ""),
      });
      if (!res.ok) {
        setError(res.error ?? t("transport.errorCustody"));
        return;
      }
      setCustodyFor(null);
      refresh();
    });
  }

  async function onGenerateManifest() {
    setError(null);
    setGenerating(true);
    try {
      const res = await generateTransportManifest({ caseId });
      if (!res.ok || !res.base64) {
        setError(res.error ?? t("transport.errorManifest"));
        return;
      }
      const url = base64ToBlobUrl(res.base64);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName ?? "transport-manifest.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      refresh();
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {legs.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {legs.map((leg) =>
            editingLeg === leg.id ? (
              <LegForm
                key={leg.id}
                leg={leg}
                pending={pending}
                onSubmit={onSaveLeg}
                onCancel={() => setEditingLeg(null)}
                t={t}
              />
            ) : (
              <div key={leg.id} className="surface px-4 py-3.5">
                {/* Route + status */}
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 t-body font-semibold">
                    <span>{leg.from || "—"}</span>
                    <IconPlane size={15} className="shrink-0 text-muted" />
                    <span>{leg.to || "—"}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-chip border px-2 py-0.5 t-label ${STATUS_TONE[leg.status]}`}
                  >
                    {t(`transport.status.${leg.status}`)}
                  </span>
                </div>

                {/* Meta line */}
                <p className="mt-1 t-meta text-muted">
                  {t(`transport.types.${legTypeToForm(leg.type)}`)}
                  {leg.carrier ? ` · ${leg.carrier}` : ""}
                  {leg.flightNo ? ` · ${leg.flightNo}` : ""}
                  {leg.awbNo ? ` · AWB ${leg.awbNo}` : ""}
                </p>
                {leg.scheduledAt ? (
                  <p className="mt-0.5 t-meta text-muted">
                    {t("transport.scheduled")}: {formatDateTime(leg.scheduledAt, locale)}
                  </p>
                ) : null}

                {/* Custody timeline */}
                {leg.custodyChain.length > 0 ? (
                  <ol className="mt-3 border-l border-line pl-3.5">
                    {leg.custodyChain.map((ev, i) => (
                      <li key={i} className="relative pb-2.5 last:pb-0">
                        <span
                          aria-hidden
                          className="absolute -left-[19px] top-1 h-1.5 w-1.5 rounded-full bg-ink"
                        />
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="t-meta font-medium">
                            {t(`transport.custody.${ev.event}`)}
                          </span>
                          <span className="shrink-0 t-meta text-muted">
                            {formatDateTime(ev.at, locale)}
                          </span>
                        </span>
                        {ev.by || ev.note ? (
                          <span className="mt-0.5 block t-meta text-muted">
                            {[ev.by, ev.note].filter(Boolean).join(" — ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : null}

                {/* Custody add form */}
                {custodyFor === leg.id ? (
                  <CustodyForm
                    pending={pending}
                    onSubmit={(e) => onAddCustody(e, leg.id)}
                    onCancel={() => setCustodyFor(null)}
                    t={t}
                  />
                ) : null}

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {leg.status !== "completed" ? (
                    <button
                      type="button"
                      onClick={() => onAdvance(leg)}
                      disabled={busyId === leg.id || pending}
                      className="pressable flex min-h-9 items-center gap-1 rounded-xl bg-ink px-3 text-[13px] font-semibold text-bg disabled:opacity-60"
                    >
                      <IconCheck size={14} />
                      {t(
                        `transport.advanceTo.${TRANSPORT_NEXT[leg.status]}`,
                      )}
                    </button>
                  ) : null}
                  {custodyFor !== leg.id ? (
                    <button
                      type="button"
                      onClick={() => setCustodyFor(leg.id)}
                      className="pressable min-h-9 rounded-xl border border-line px-3 text-[13px] font-medium text-ink"
                    >
                      {t("transport.addCustody")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setEditingLeg(leg.id)}
                    className="pressable min-h-9 rounded-xl border border-line px-3 text-[13px] font-medium text-muted"
                  >
                    {t("transport.edit")}
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      ) : null}

      {/* Add leg */}
      {editingLeg === "new" ? (
        <LegForm
          pending={pending}
          onSubmit={onSaveLeg}
          onCancel={() => setEditingLeg(null)}
          t={t}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingLeg("new")}
          className="pressable flex min-h-11 items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-card px-4 text-sm font-medium text-muted"
        >
          <IconPlus size={16} />
          {t("transport.addLeg")}
        </button>
      )}

      {/* Manifest */}
      {legs.length > 0 ? (
        <button
          type="button"
          onClick={onGenerateManifest}
          disabled={generating}
          className="pressable flex min-h-11 items-center justify-center gap-1.5 rounded-card border border-line bg-card px-4 text-sm font-medium text-ink disabled:opacity-60"
        >
          <IconDoc size={16} />
          {generating ? t("transport.generatingManifest") : t("transport.generateManifest")}
        </button>
      ) : null}

      {error ? (
        <p className="px-1 text-[13px] font-medium text-urgent">{error}</p>
      ) : null}
    </div>
  );
}

/** planned → booked → in_transit → completed (the label for the advance CTA). */
const TRANSPORT_NEXT: Record<
  Exclude<TransportLegStatus, "completed">,
  TransportLegStatus
> = {
  planned: "booked",
  booked: "in_transit",
  in_transit: "completed",
};

type TFn = ReturnType<typeof useTranslations>;

function LegForm({
  leg,
  pending,
  onSubmit,
  onCancel,
  t,
}: {
  leg?: TransportLeg;
  pending: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  t: TFn;
}) {
  const field =
    "min-h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink";
  return (
    <form onSubmit={onSubmit} className="rounded-card border border-line bg-card px-4 py-3.5">
      {leg ? <input type="hidden" name="legId" value={leg.id} /> : null}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-1 block t-label">{t("transport.field.type")}</span>
          <select
            name="type"
            defaultValue={leg ? legTypeToForm(leg.type) : "air_cargo"}
            className={field}
          >
            {LEG_TYPES.map((k) => (
              <option key={k} value={k}>
                {t(`transport.types.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block t-label">{t("transport.field.from")}</span>
          <input name="from" defaultValue={leg?.from ?? ""} placeholder="VIE" className={field} />
        </label>
        <label>
          <span className="mb-1 block t-label">{t("transport.field.to")}</span>
          <input name="to" defaultValue={leg?.to ?? ""} placeholder="TLV" className={field} />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block t-label">{t("transport.field.carrier")}</span>
          <input name="carrier" defaultValue={leg?.carrier ?? ""} className={field} />
        </label>
        <label>
          <span className="mb-1 block t-label">{t("transport.field.flightNo")}</span>
          <input name="flightNo" defaultValue={leg?.flightNo ?? ""} className={field} />
        </label>
        <label>
          <span className="mb-1 block t-label">{t("transport.field.awbNo")}</span>
          <input name="awbNo" defaultValue={leg?.awbNo ?? ""} className={field} />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block t-label">{t("transport.field.scheduledAt")}</span>
          <input
            type="datetime-local"
            name="scheduledAt"
            defaultValue={toLocalInput(leg?.scheduledAt)}
            className={field}
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <button
          type="submit"
          disabled={pending}
          className="pressable flex min-h-10 items-center gap-1 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg disabled:opacity-60"
        >
          {pending ? t("transport.saving") : t("transport.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="pressable min-h-10 rounded-xl border border-line px-3 text-[13px] font-medium text-muted"
        >
          {t("transport.cancel")}
        </button>
      </div>
    </form>
  );
}

function CustodyForm({
  pending,
  onSubmit,
  onCancel,
  t,
}: {
  pending: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  t: TFn;
}) {
  const field =
    "min-h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink";
  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 rounded-xl border border-line bg-bg/60 px-3.5 py-3"
    >
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label>
          <span className="mb-1 block t-label">{t("transport.field.event")}</span>
          <select name="event" defaultValue="handed_over" className={field}>
            {CUSTODY_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`transport.custody.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block t-label">{t("transport.field.at")}</span>
          <input type="datetime-local" name="at" className={field} />
        </label>
        <label>
          <span className="mb-1 block t-label">{t("transport.field.by")}</span>
          <input name="by" className={field} />
        </label>
        <label>
          <span className="mb-1 block t-label">{t("transport.field.note")}</span>
          <input name="note" className={field} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <button
          type="submit"
          disabled={pending}
          className="pressable flex min-h-10 items-center gap-1 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg disabled:opacity-60"
        >
          <IconPlus size={14} />
          {pending ? t("transport.saving") : t("transport.addEvent")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="pressable min-h-10 rounded-xl border border-line px-3 text-[13px] font-medium text-muted"
        >
          {t("transport.cancel")}
        </button>
      </div>
    </form>
  );
}
