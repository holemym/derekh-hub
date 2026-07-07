import Link from "next/link";
import { getTranslations } from "next-intl/server";
import NewPermitForm from "@/components/NewPermitForm";
import { IconChevronRight } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * "New permit" — a dead-simple form to type a niftar's details, get the official
 * Israeli MFA transfer permit (client-side, offline) and save the entry as a
 * case. The heavy lifting (fields, generate, save) lives in NewPermitForm.
 */
export default async function NewPermitPage() {
  const t = await getTranslations("newPermit");

  return (
    <div>
      <Link
        href="/cases"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted"
      >
        <IconChevronRight size={16} className="rotate-180" />
        {t("back")}
      </Link>

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mb-5 text-sm text-muted">{t("subtitle")}</p>

      <NewPermitForm />
    </div>
  );
}
