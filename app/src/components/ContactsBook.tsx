"use client";

/**
 * The shared address book (/contacts, ROADMAP M4.5). One quiet list: every
 * non-deleted contact with role tags and reach info; tap a row to edit it
 * inline, or add a new one. All writes go through server actions under the
 * RLS-scoped staff session (soft delete only — history stays intact).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ContactBookEntry, ContactRole } from "@/lib/types";
import { CONTACT_ROLES } from "@/lib/types";
import { saveContact, removeContact } from "@/app/contacts/actions";
import EmptyState from "@/components/EmptyState";
import { IconPlus, IconContacts } from "@/components/icons";

const field =
  "min-h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink";

interface Draft {
  id?: string;
  name: string;
  organization: string;
  phone: string;
  whatsapp: string;
  email: string;
  notes: string;
  roles: ContactRole[];
}

const EMPTY: Draft = {
  name: "",
  organization: "",
  phone: "",
  whatsapp: "",
  email: "",
  notes: "",
  roles: [],
};

export default function ContactsBook({ book }: { book: ContactBookEntry[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** null = closed · "new" = creating · id = editing that contact. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? book.filter((b) =>
        [b.name, b.organization, b.phone, b.whatsapp, b.email]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      )
    : book;

  function openNew() {
    setDraft(EMPTY);
    setOpenId("new");
    setError(null);
  }

  function openEdit(b: ContactBookEntry) {
    setDraft({
      id: b.id,
      name: b.name,
      organization: b.organization ?? "",
      phone: b.phone ?? "",
      whatsapp: b.whatsapp ?? "",
      email: b.email ?? "",
      notes: b.notes ?? "",
      roles: b.roles,
    });
    setOpenId(b.id);
    setError(null);
  }

  function toggleRole(r: ContactRole) {
    setDraft((d) => ({
      ...d,
      roles: d.roles.includes(r)
        ? d.roles.filter((x) => x !== r)
        : [...d.roles, r],
    }));
  }

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveContact({
        id: draft.id,
        name: draft.name,
        organization: draft.organization,
        phone: draft.phone,
        whatsapp: draft.whatsapp,
        email: draft.email,
        notes: draft.notes,
        roles: draft.roles,
      });
      if (!res.ok) {
        setError(res.error ?? t("contacts.errorSave"));
        return;
      }
      setOpenId(null);
      router.refresh();
    });
  }

  function onRemove() {
    if (!draft.id) return;
    if (!window.confirm(t("contacts.confirmRemove", { name: draft.name }))) return;
    setError(null);
    startTransition(async () => {
      const res = await removeContact({ id: draft.id! });
      if (!res.ok) {
        setError(res.error ?? t("contacts.errorSave"));
        return;
      }
      setOpenId(null);
      router.refresh();
    });
  }

  const editor = (
    <form onSubmit={onSave} className="rounded-card border border-line bg-card px-4 py-3.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <input
          autoFocus
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder={t("contacts.field.name")}
          className={field}
        />
        <input
          type="text"
          value={draft.organization}
          onChange={(e) => setDraft({ ...draft, organization: e.target.value })}
          placeholder={t("contacts.field.organization")}
          className={field}
        />
        <input
          type="tel"
          value={draft.phone}
          onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
          placeholder={t("contacts.field.phone")}
          className={field}
        />
        <input
          type="tel"
          value={draft.whatsapp}
          onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })}
          placeholder={t("contacts.field.whatsapp")}
          className={field}
        />
        <input
          type="email"
          value={draft.email}
          onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          placeholder={t("contacts.field.email")}
          className="min-h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink sm:col-span-2"
        />
        <input
          type="text"
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          placeholder={t("contacts.field.notes")}
          className="min-h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink sm:col-span-2"
        />
      </div>

      {/* Role tags — which hats this contact usually wears. */}
      <p className="mb-1.5 mt-3 t-label">{t("contacts.field.roles")}</p>
      <div className="flex flex-wrap gap-1.5">
        {CONTACT_ROLES.map((r) => {
          const on = draft.roles.includes(r);
          return (
            <button
              key={r}
              type="button"
              onClick={() => toggleRole(r)}
              className={`pressable min-h-8 rounded-chip border px-2.5 t-meta font-medium ${
                on
                  ? "border-ink bg-ink text-bg"
                  : "border-line bg-bg text-muted"
              }`}
            >
              {t(`contacts.roles.${r}`)}
            </button>
          );
        })}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
        <button
          type="submit"
          disabled={pending || !draft.name.trim()}
          className="pressable flex min-h-10 items-center gap-1 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg disabled:opacity-60"
        >
          {pending ? t("contacts.saving") : t("contacts.save")}
        </button>
        <button
          type="button"
          onClick={() => setOpenId(null)}
          className="pressable min-h-10 rounded-xl border border-line px-3 text-[13px] font-medium text-muted"
        >
          {t("common.cancel")}
        </button>
        {draft.id ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            className="pressable ml-auto min-h-10 rounded-xl border border-line px-3 text-[13px] font-medium text-muted disabled:opacity-50"
          >
            {t("contacts.remove")}
          </button>
        ) : null}
      </div>
    </form>
  );

  return (
    <div className="flex flex-col gap-2.5">
      {/* Search + add */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("contacts.search")}
          className={field}
        />
        {openId === null ? (
          <button
            type="button"
            onClick={openNew}
            className="pressable flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-ink px-3.5 text-[13px] font-semibold text-bg"
          >
            <IconPlus size={15} />
            {t("contacts.new")}
          </button>
        ) : null}
      </div>

      {openId === "new" ? editor : null}

      {filtered.length > 0 ? (
        <ul className="overflow-hidden rounded-card border border-line bg-card">
          {filtered.map((b, i) => (
            <li key={b.id} className={i > 0 ? "border-t border-line" : ""}>
              {openId === b.id ? (
                <div className="p-1.5">{editor}</div>
              ) : (
                <button
                  type="button"
                  onClick={() => openEdit(b)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="truncate t-heading font-medium">{b.name}</span>
                      {b.roles.map((r) => (
                        <span
                          key={r}
                          className="shrink-0 rounded-chip border border-line px-2 py-0.5 t-label"
                        >
                          {t(`contacts.roles.${r}`)}
                        </span>
                      ))}
                    </span>
                    <span className="mt-0.5 block truncate t-meta text-muted">
                      {[b.organization, b.phone ?? b.whatsapp, b.email]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : openId !== "new" ? (
        <EmptyState
          icon={<IconContacts size={22} />}
          title={t("contacts.emptyTitle")}
          body={t("contacts.emptyBody")}
        />
      ) : null}

      {error && openId === null ? (
        <p className="px-1 text-[13px] font-medium text-urgent">{error}</p>
      ) : null}
    </div>
  );
}
