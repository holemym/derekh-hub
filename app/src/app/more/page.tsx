import { getTranslations } from "next-intl/server";
import LanguageSwitch from "@/components/LanguageSwitch";
import SignOutButton from "@/components/SignOutButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IconDoc, IconContacts, IconMore } from "@/components/icons";

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
    <div>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">
        {t("title")}
      </h1>

      {/* Signed-in identity + sign out */}
      <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
        {tAuth("account")}
      </h2>
      <div className="rounded-card border border-line bg-card p-4">
        {user ? (
          <div className="mb-3">
            {staffName ? (
              <p className="text-sm font-semibold">{staffName}</p>
            ) : null}
            <p className="truncate text-[13px] text-muted">{user.email}</p>
          </div>
        ) : null}
        <SignOutButton />
      </div>

      <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
        {t("language")}
      </h2>
      <div className="rounded-card border border-line bg-card p-3">
        <LanguageSwitch />
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-card">
        {placeholders.map(({ key, Icon }, i) => (
          <div
            key={key}
            className={`flex min-h-[52px] items-center justify-between gap-3 px-4 py-3 ${
              i > 0 ? "border-t border-line" : ""
            }`}
          >
            <span className="flex items-center gap-2.5 text-sm font-medium text-muted">
              <Icon size={18} />
              {t(key)}
            </span>
            <span className="rounded-chip border border-line px-2 py-0.5 text-[11px] text-muted">
              {t("comingSoon")}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-6 px-1 text-[13px] leading-relaxed text-muted">
        {t("about")}
      </p>
      <p className="mt-2 px-1 text-xs text-muted">{t("version")}</p>
    </div>
  );
}
