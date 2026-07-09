"use server";

/**
 * Case-contact server actions (ROADMAP M4.5) — link people to a case in a role.
 *
 * The linked `family` contact is what makes the rest of M4 real: CaseComms uses
 * it as the recipient and the invoice PDF uses it as bill-to. Links live in
 * case_contacts (PK case_id+contact_id+role); staff can INSERT, unlink is a
 * hard DELETE which RLS restricts to owners (0002) — acceptable: both current
 * users are owners, and a failed unlink returns the RLS error cleanly.
 *
 * Linking/unlinking is audited to activity_log like stage changes.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ContactRole } from "@/lib/types";
import { CONTACT_ROLES } from "@/lib/types";
import { dbContactRole } from "@/lib/repo/mapper";
import { saveContact, type ContactFields } from "@/app/contacts/actions";
import type { CaseContactInsert, ActivityLogInsert } from "../../../../../../db/types";

export interface CaseContactResult {
  ok: boolean;
  error?: string;
}

function isRole(v: unknown): v is ContactRole {
  return (CONTACT_ROLES as readonly string[]).includes(v as string);
}

/** Append an audited activity_log row (best-effort, same as comms/stages). */
async function logActivity(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  caseId: string,
  action: "contact_linked" | "contact_unlinked",
  detail: { contact_id: string; role: string },
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let label: string | null = null;
  if (user) {
    const { data: staff } = await supabase
      .from("staff")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();
    label = (staff as { name: string } | null)?.name ?? null;
  }
  const log: ActivityLogInsert = {
    case_id: caseId,
    actor: user?.id ?? null,
    actor_label: label,
    action,
    detail,
  };
  await supabase.from("activity_log").insert(log as never);
}

/** Link an existing address-book contact to a case in a role. */
export async function linkContact(input: {
  caseId: string;
  contactId: string;
  role: string;
}): Promise<CaseContactResult> {
  if (!input.caseId || !input.contactId)
    return { ok: false, error: "Missing case or contact." };
  if (!isRole(input.role)) return { ok: false, error: "Unknown role." };

  const supabase = await createSupabaseServerClient();
  const link: CaseContactInsert = {
    case_id: input.caseId,
    contact_id: input.contactId,
    role: dbContactRole(input.role),
  };
  const { error } = await supabase.from("case_contacts").insert(link as never);
  if (error) {
    // 23505 = duplicate PK — the contact is already linked in this role.
    if (error.code === "23505")
      return { ok: false, error: "Already linked in this role." };
    return { ok: false, error: `Could not link contact: ${error.message}` };
  }

  await logActivity(supabase, input.caseId, "contact_linked", {
    contact_id: input.contactId,
    role: dbContactRole(input.role),
  });
  revalidatePath(`/cases/${input.caseId}`);
  return { ok: true };
}

/** Create a new contact in the book AND link it to the case in one step. */
export async function createAndLinkContact(
  input: ContactFields & { caseId: string; role: string },
): Promise<CaseContactResult> {
  if (!isRole(input.role)) return { ok: false, error: "Unknown role." };

  const saved = await saveContact({
    name: input.name,
    organization: input.organization,
    phone: input.phone,
    whatsapp: input.whatsapp,
    email: input.email,
    notes: input.notes,
    // Tag the book entry with the role it was created for.
    roles: [input.role],
  });
  if (!saved.ok || !saved.id) return { ok: false, error: saved.error };

  return linkContact({
    caseId: input.caseId,
    contactId: saved.id,
    role: input.role,
  });
}

/** Unlink a contact from a case (hard DELETE on the link row; owner-only RLS). */
export async function unlinkContact(input: {
  caseId: string;
  contactId: string;
  role: string;
}): Promise<CaseContactResult> {
  if (!input.caseId || !input.contactId)
    return { ok: false, error: "Missing case or contact." };
  if (!isRole(input.role)) return { ok: false, error: "Unknown role." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("case_contacts")
    .delete()
    .eq("case_id", input.caseId)
    .eq("contact_id", input.contactId)
    .eq("role", dbContactRole(input.role));
  if (error) return { ok: false, error: `Could not unlink: ${error.message}` };

  await logActivity(supabase, input.caseId, "contact_unlinked", {
    contact_id: input.contactId,
    role: dbContactRole(input.role),
  });
  revalidatePath(`/cases/${input.caseId}`);
  return { ok: true };
}
