"use client";

/**
 * Per-case contacts (ROADMAP M4.5). Shows who is linked to this case in which
 * role, and lets the operator link someone: either pick an existing address-
 * book entry or create a new contact inline (name + phone/WhatsApp/email) —
 * both via server actions under the RLS-scoped staff session.
 *
 * The `family` link matters most: CaseComms picks it as the recipient and the
 * invoice PDF uses it as bill-to, so an empty state nudges toward adding one.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CaseContactCard, ContactBookEntry, ContactRole } from "@/lib/types";
import { CONTACT_ROLES } from "@/lib/types";
import {
  linkContact,
  createAndLinkContact,
  unlinkContact,
} from "@/app/cases/[id]/contacts/actions";
import { IconPlus, IconContacts } from "@/components/icons";

const field =
  "min-h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink";

export default function CaseContacts({
  caseId,
  cards,
  book,
}: {
  caseId: string;
  cards: CaseContactCard[];
  book: ContactBookEntry[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [role, setRole] = useState<ContactRole>("family");
  const [contactId, setContactId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");

  // Book entries not already linked in the chosen role.
  const linkedInRole = new Set(
    cards.filter((c) => c.role === role).map((c) => c.contactId),
  );
  const available = book.filter((b) => !linkedInRole.has(b.id));

  function reset() {
    setAdding(false);
    setMode("existing");
    setContactId("");
    setName("");
    setPhone("");
    setWhatsapp("");
    setEmail("");
    setOrganization("");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res =
        mode === "existing"
          ? await linkContact({ caseId, contactId, role })
          : await createAndLinkContact({
              caseId,
              role,
              name,
              phone,
              whatsapp,
              email,
              organization,
            });
      if (!res.ok) {
        setError(res.error ?? t("contacts.errorSave"));
        return;
      }
      reset();
      router.refresh();
    });
  }

  function onUnlink(card: CaseContactCard) {
    if (!window.confirm(t("contacts.confirmUnlink", { name: card.name }))) return;
    setError(null);
    startTransition(async () => {
      const res = await unlinkContact({
        caseId,
        contactId: card.contactId,
        role: card.role,
      });
      if (!res.ok) {
        setError(res.error ?? t("contacts.errorSave"));
        return;
      }
      router.refresh();
    });
  }

  const canSubmit =
    mode === "existing" ? contactId !== "" : name.trim() !== "";

  return (
    <div className="flex flex-col gap-2.5">
      {cards.length > 0 ? (
        <ul className="overflow-hidden rounded-card border border-line bg-card">
          {cards.map((card, i) => (
            <li
              key={`${card.contactId}-${card.role}`}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${
                i > 0 ? "border-t border-line" : ""
              }`}
            >
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="truncate t-heading font-medium">
                    {card.name}
                  </span>
                  <span className="shrink-0 rounded-chip border border-line px-2 py-0.5 t-label">
                    {t(`contacts.roles.${card.role}`)}
                  </span>
                </span>
                <span className="mt-0.5 block truncate t-meta text-muted">
                  {[card.organization, card.phone ?? card.whatsapp, card.email]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onUnlink(card)}
                disabled={pending}
                className="pressable min-h-9 shrink-0 rounded-xl border border-line px-3 text-[13px] font-medium text-muted disabled:opacity-50"
              >
                {t("contacts.unlink")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <form
          onSubmit={onSubmit}
          className="rounded-card border border-line bg-card px-4 py-3.5"
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label>
              <span className="mb-1 block t-label">{t("contacts.field.role")}</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ContactRole)}
                className={field}
              >
                {CONTACT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`contacts.roles.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block t-label">{t("contacts.field.who")}</span>
              <select
                value={mode === "new" ? "__new__" : contactId}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setMode("new");
                    setContactId("");
                  } else {
                    setMode("existing");
                    setContactId(e.target.value);
                  }
                }}
                className={field}
              >
                <option value="">{t("contacts.pickExisting")}</option>
                {available.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.organization ? ` — ${b.organization}` : ""}
                  </option>
                ))}
                <option value="__new__">{t("contacts.createNew")}</option>
              </select>
            </label>
          </div>

          {mode === "new" ? (
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("contacts.field.name")}
                className={field}
              />
              <input
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder={t("contacts.field.organization")}
                className={field}
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("contacts.field.phone")}
                className={field}
              />
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder={t("contacts.field.whatsapp")}
                className={field}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("contacts.field.email")}
                className="min-h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink sm:col-span-2"
              />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <button
              type="submit"
              disabled={pending || !canSubmit}
              className="pressable flex min-h-10 items-center gap-1 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg disabled:opacity-60"
            >
              <IconPlus size={15} />
              {pending ? t("contacts.saving") : t("contacts.link")}
            </button>
            <button
              type="button"
              onClick={reset}
              className="pressable min-h-10 rounded-xl border border-line px-3 text-[13px] font-medium text-muted"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="pressable flex min-h-11 items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-card px-4 text-sm font-medium text-muted"
        >
          <IconPlus size={16} />
          {cards.length === 0 ? t("contacts.addFirst") : t("contacts.add")}
        </button>
      )}

      {cards.length === 0 && !adding ? (
        <p className="flex items-start gap-1.5 px-1 t-meta text-muted">
          <IconContacts size={14} className="mt-0.5 shrink-0" />
          {t("contacts.familyHint")}
        </p>
      ) : null}

      {error ? (
        <p className="px-1 text-[13px] font-medium text-urgent">{error}</p>
      ) : null}
    </div>
  );
}
