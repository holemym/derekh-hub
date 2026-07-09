import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { listContactBook } from "@/lib/repo";
import ContactsBook from "@/components/ContactsBook";
import { IconChevronRight } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * The shared address book (ROADMAP M4.5) — chevra kadisha, consulates, airlines,
 * families… Contacts linked to a case (in a role) drive comms recipients and
 * invoice bill-to. Reachable from the sidebar (desktop) and More (mobile).
 */
export default async function ContactsPage() {
  const t = await getTranslations();
  const book = await listContactBook();

  return (
    <div className="mx-auto max-w-[720px]">
      <Link
        href="/more"
        className="mb-4 inline-flex min-h-11 items-center gap-1 t-meta font-medium text-muted lg:hidden"
      >
        <IconChevronRight size={16} className="rotate-180" />
        {t("more.title")}
      </Link>

      <h1 className="mb-1 t-display lg:hidden">{t("contacts.title")}</h1>
      <p className="mb-6 t-meta text-muted">{t("contacts.subtitle")}</p>

      <ContactsBook book={book} />
    </div>
  );
}
