import { getTranslations } from "next-intl/server";
import EmptyState from "@/components/EmptyState";
import { IconPlane } from "@/components/icons";

export const dynamic = "force-dynamic";

/** Placeholder — the transport board lands in a later phase (PLANNING §12, Phase 3). */
export default async function TransportPage() {
  const t = await getTranslations("transportPage");

  return (
    <div className="mx-auto max-w-[720px]">
      <h1 className="mb-5 t-display lg:hidden">{t("title")}</h1>
      <EmptyState
        icon={<IconPlane size={26} />}
        title={t("emptyTitle")}
        body={t("emptyBody")}
      />
    </div>
  );
}
