"use client";

/**
 * Family status updates (ROADMAP M4). Compose a message from a template
 * (received | documents_ready | permit_issued | in_transit | arrived | buried),
 * rendered with the case + family name in the current locale, pick a channel
 * (WhatsApp / email), then open a PREFILLED hand-off link in the operator's own
 * app — we have no messaging provider keys so nothing is sent automatically.
 *
 * WhatsApp → https://wa.me/<digits>?text=…   Email → mailto:?subject=&body=…
 *
 * "Mark sent" logs a `messages` row (channel, template_key, recipient, body,
 * sent_at=now) via a server action and the history reflects it. Automated
 * sending is a documented follow-up (WhatsApp Business / Twilio + SMTP).
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type {
  Message,
  MessageChannel,
  MessageTemplateKey,
  CaseContactCard,
} from "@/lib/types";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/types";
import { buildWhatsAppLink, buildMailtoLink } from "@/lib/comms";
import { formatDateTime } from "@/lib/format";
import { logMessageSent, sendMessageNow } from "@/app/cases/[id]/comms/actions";
import { IconChat, IconCheck } from "@/components/icons";

export default function CaseComms({
  caseId,
  niftarName,
  family,
  messages,
  can = { email: false, whatsapp: false },
}: {
  caseId: string;
  /** Display name of the niftar (secular preferred). */
  niftarName: string;
  /** The linked family contact, if any (recipient for comms). */
  family?: CaseContactCard;
  messages: Message[];
  /** Which channels can really send server-side (env keys present; M4.5). */
  can?: { email: boolean; whatsapp: boolean };
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState<MessageTemplateKey>("received");
  const [channel, setChannel] = useState<MessageChannel>("whatsapp");
  const [sentKey, setSentKey] = useState(0); // bump to re-enable after a send

  const familyName = family?.name?.trim() || t("comms.familyFallback");

  // Render the chosen template with {family} + {niftar} in the active locale.
  const body = useMemo(
    () =>
      t(`comms.templates.${templateKey}`, {
        family: familyName,
        niftar: niftarName || t("comms.niftarFallback"),
      }),
    [t, templateKey, familyName, niftarName],
  );
  const subject = useMemo(
    () => t("comms.subject", { niftar: niftarName || t("comms.niftarFallback") }),
    [t, niftarName],
  );

  const waPhone = family?.whatsapp || family?.phone;
  const recipient = channel === "whatsapp" ? waPhone : family?.email;

  const handoffLink =
    channel === "whatsapp"
      ? buildWhatsAppLink(waPhone, body)
      : buildMailtoLink(family?.email, subject, body);

  const canSendNow =
    (channel === "email" && can.email && !!family?.email) ||
    (channel === "whatsapp" && can.whatsapp && !!waPhone);

  function onMarkSent() {
    setError(null);
    startTransition(async () => {
      const res = await logMessageSent({
        caseId,
        channel,
        templateKey,
        recipient: recipient ?? undefined,
        body,
      });
      if (!res.ok) {
        setError(res.error ?? t("comms.errorLog"));
        return;
      }
      setSentKey((k) => k + 1);
      router.refresh();
    });
  }

  /** Real server-side send (M4.5) — only offered when the channel has keys. */
  function onSendNow() {
    setError(null);
    startTransition(async () => {
      const res = await sendMessageNow({
        caseId,
        channel,
        templateKey,
        recipient: recipient ?? undefined,
        subject,
        body,
      });
      if (!res.ok) {
        setError(res.error ?? t("comms.errorSend"));
        return;
      }
      setSentKey((k) => k + 1);
      router.refresh();
    });
  }

  const field =
    "min-h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink";

  return (
    <div className="flex flex-col gap-2.5">
      {/* Composer */}
      <div className="rounded-card border border-line bg-card px-4 py-3.5">
        {/* Recipient */}
        <p className="mb-3 t-meta text-muted">
          {family ? (
            <>
              {t("comms.to")}{" "}
              <span className="font-medium text-ink">{familyName}</span>
              {recipient ? <span> · {recipient}</span> : null}
            </>
          ) : (
            t("comms.noFamily")
          )}
        </p>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <label>
            <span className="mb-1 block t-label">{t("comms.field.template")}</span>
            <select
              value={templateKey}
              onChange={(e) => {
                setTemplateKey(e.target.value as MessageTemplateKey);
                setSentKey(0);
              }}
              className={field}
            >
              {MESSAGE_TEMPLATE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`comms.templateLabels.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block t-label">{t("comms.field.channel")}</span>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as MessageChannel)}
              className={field}
            >
              <option value="whatsapp">{t("comms.channels.whatsapp")}</option>
              <option value="email">{t("comms.channels.email")}</option>
            </select>
          </label>
        </div>

        {/* Preview */}
        <div className="mt-3 rounded-xl border border-line bg-bg/60 px-3.5 py-3">
          <p className="whitespace-pre-wrap t-meta text-ink">{body}</p>
        </div>

        {/* Actions — real send when configured; hand-off link always works. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {canSendNow ? (
            <button
              type="button"
              onClick={onSendNow}
              disabled={pending}
              className="pressable flex min-h-10 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg disabled:opacity-60"
            >
              {sentKey > 0 ? <IconCheck size={14} /> : <IconChat size={15} />}
              {pending
                ? t("comms.sending")
                : sentKey > 0
                  ? t("comms.sent")
                  : t("comms.sendNow")}
            </button>
          ) : null}
          <a
            href={handoffLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`pressable flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 text-[13px] ${
              canSendNow
                ? "border border-line font-medium text-ink"
                : "bg-ink font-semibold text-bg"
            }`}
          >
            <IconChat size={15} />
            {channel === "whatsapp"
              ? t("comms.openWhatsApp")
              : t("comms.openEmail")}
          </a>
          <button
            type="button"
            onClick={onMarkSent}
            disabled={pending}
            className="pressable flex min-h-10 items-center gap-1 rounded-xl border border-line px-3 text-[13px] font-medium text-ink disabled:opacity-60"
          >
            {sentKey > 0 ? <IconCheck size={14} /> : null}
            {pending
              ? t("comms.logging")
              : sentKey > 0
                ? t("comms.logged")
                : t("comms.markSent")}
          </button>
        </div>
        <p className="mt-2 t-meta text-muted">
          {canSendNow ? t("comms.sendNote") : t("comms.handoffNote")}
        </p>
      </div>

      {/* History */}
      {messages.length > 0 ? (
        <ul className="overflow-hidden rounded-card border border-line bg-card">
          {messages.map((m, i) => (
            <li
              key={m.id}
              className={`px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="t-meta font-medium">
                  {m.templateKey && t.has(`comms.templateLabels.${m.templateKey}`)
                    ? t(`comms.templateLabels.${m.templateKey}`)
                    : t("comms.update")}
                  <span className="ml-1.5 font-normal text-muted">
                    · {t(`comms.channels.${m.channel}`)}
                  </span>
                </span>
                {m.sentAt ? (
                  <span className="shrink-0 t-meta text-muted">
                    {formatDateTime(m.sentAt, locale)}
                  </span>
                ) : null}
              </div>
              {m.body ? (
                <p className="mt-1 line-clamp-2 t-meta text-muted">{m.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="px-1 text-[13px] font-medium text-urgent">{error}</p>
      ) : null}
    </div>
  );
}
