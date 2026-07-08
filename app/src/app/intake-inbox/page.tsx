import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import IntakeInbox from "@/components/IntakeInbox";
import IntakeLink from "@/components/IntakeLink";
import { IconChevronRight } from "@/components/icons";
import type { IntakeFile } from "../../../../db/types";

export const dynamic = "force-dynamic";

/** A `new` submission projected for the inbox list + review sheet. */
export interface InboxSubmission {
  id: string;
  submittedAt: string;
  payload: Record<string, string>;
  files: IntakeFile[];
}

/**
 * STAFF intake inbox (ROADMAP M1). Lists intake_submissions with status='new'
 * (newest first) via the RLS-scoped staff server client, and shows the shareable
 * PUBLIC intake link so staff can send it to a family. Import/Reject happen in
 * intake-inbox/actions.ts.
 */
export default async function IntakeInboxPage() {
  const t = await getTranslations("intakeInbox");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("intake_submissions")
    .select("id, payload, files, submitted_at")
    .eq("status", "new")
    .order("submitted_at", { ascending: false });

  const rows = (data ?? []) as Array<{
    id: string;
    payload: Record<string, string> | null;
    files: IntakeFile[] | null;
    submitted_at: string;
  }>;

  const submissions: InboxSubmission[] = rows.map((r) => ({
    id: r.id,
    submittedAt: r.submitted_at,
    payload: (r.payload ?? {}) as Record<string, string>,
    files: Array.isArray(r.files) ? r.files : [],
  }));

  // Absolute public intake link for staff to share (host from the request).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const intakeUrl = host ? `${proto}://${host}/intake` : "/intake";

  return (
    <div className="mx-auto max-w-[720px]">
      <Link
        href="/more"
        className="mb-4 inline-flex min-h-11 items-center gap-1 t-meta font-medium text-muted lg:hidden"
      >
        <IconChevronRight size={16} className="rotate-180" />
        {t("back")}
      </Link>

      <h1 className="mb-1 t-display lg:hidden">{t("title")}</h1>
      <p className="mb-6 t-meta text-muted">{t("subtitle")}</p>

      <IntakeLink url={intakeUrl} />

      <IntakeInbox submissions={submissions} />
    </div>
  );
}
