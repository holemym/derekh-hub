import Link from "next/link";
import { getTranslations } from "next-intl/server";
import LanguageSwitch from "@/components/LanguageSwitch";
import SignOutButton from "@/components/SignOutButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  IconDoc,
  IconContacts,
  IconMore,
  IconInbox,
  IconCheck,
  IconChevronRight,
} from "@/components/icons";

export const dynamic = "force-dynamic";

/** More — signed-in identity, language switch + placeholders for later phases. */
export default async function MorePage() {
  const t = await getTranslations("more");
  const tAuth = await getTranslations("auth");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let staffName: string | null = null;
  if (user) {
    const { data: staff } = await supabase
      .from("staff")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();
    staffName = (staff as { name: string } | null)?.name ?? null;
  }

  const placeholders = [
    { key: "settings", Icon: IconMore },
    { key: "templates", Icon: IconDoc },
    { key: "contacts", Icon: IconContacts },
  ] as const;

  return (
    <div className="mx-auto max-w-[720px]">
      <h1 className="mb-5 t-display lg:hidden">{t("title")}</h1>

      {/* Signed-in identity + sign out */}
      <h2 className="t-label mb-2 px-1">{tAuth("account")}</h2>
      <div className="surface p-4">
        {user ? (
          <div className="mb-3">
            {staffName ? (
              <p className="t-heading font-semibold">{staffName}</p>
            ) : null}
            <p className="truncate t-meta text-muted">{user.email}</p>
          </div>
        ) : null}
        <SignOutButton />
      </div>

      <h2 className="t-label mb-2 mt-6 px-1">{t("language")}</h2>
      <div className="surface p-3">
        <LanguageSwitch />
      </div>

      {/* Tasks — the all-tasks planning view (ROADMAP M2). */}
      <Link
        href="/tasks"
        className="pressable surface mt-6 flex min-h-[52px] items-center justify-between gap-3 px-4 py-3"
      >
        <span className="flex items-center gap-2.5 t-body font-medium">
          <IconCheck size={18} className="text-muted" />
          {t("tasks")}
        </span>
        <IconChevronRight size={18} className="text-muted" />
      </Link>

      {/* Family intake — the public intake inbox (staff review + import). */}
      <Link
        href="/intake-inbox"
        className="pressable surface mt-3 flex min-h-[52px] items-center justify-between gap-3 px-4 py-3"
      >
        <span className="flex items-center gap-2.5 t-body font-medium">
          <IconInbox size={18} className="text-muted" />
          {t("intake")}
        </span>
        <IconChevronRight size={18} className="text-muted" />
      </Link>

      <div className="surface mt-4 divide-y divide-line overflow-hidden">
        {placeholders.map(({ key, Icon }) => (
          <div
            key={key}
            className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-3"
          >
            <span className="flex items-center gap-2.5 t-body font-medium text-muted">
              <Icon size={18} />
              {t(key)}
            </span>
            <span className="t-label rounded-chip border border-line px-2 py-0.5">
              {t("comingSoon")}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-6 px-1 t-meta text-muted">{t("about")}</p>
      <p className="mt-2 px-1 t-meta text-muted">{t("version")}</p>
    </div>
  );
}
