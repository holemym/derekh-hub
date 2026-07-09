"use server";

/**
 * Contact-book server actions (ROADMAP M4.5) — the shared address book.
 *
 * All actions run under the RLS-scoped server client, so the contacts policies
 * (0002) govern them: staff INSERT/UPDATE; hard DELETE is owner-only and we
 * never use it — "delete" here is a soft delete (deleted_at), which is a staff
 * UPDATE and keeps history (old case links keep resolving to nothing quietly).
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ContactRole } from "@/lib/types";
import { CONTACT_ROLES } from "@/lib/types";
import { dbContactRole } from "@/lib/repo/mapper";
import type { ContactInsert } from "../../../../db/types";

export interface ContactResult {
  ok: boolean;
  error?: string;
  /** The contact id (created or updated). */
  id?: string;
}

/** Empty string → null. */
function nn(v: string | undefined | null): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function parseRoles(raw: unknown): ContactRole[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is ContactRole =>
    (CONTACT_ROLES as readonly string[]).includes(r as string),
  );
}

export interface ContactFields {
  name: string;
  organization?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  notes?: string;
  roles?: string[];
}

/** Create a contact, or update it when `id` is passed. Returns the id. */
export async function saveContact(
  input: ContactFields & { id?: string },
): Promise<ContactResult> {
  const name = nn(input.name);
  if (!name) return { ok: false, error: "A contact needs a name." };

  const payload: ContactInsert = {
    name,
    org: nn(input.organization),
    phone: nn(input.phone),
    whatsapp: nn(input.whatsapp),
    email: nn(input.email),
    notes: nn(input.notes),
    roles: parseRoles(input.roles).map(dbContactRole),
  };

  const supabase = await createSupabaseServerClient();

  if (input.id) {
    const { error } = await supabase
      .from("contacts")
      .update(payload as never)
      .eq("id", input.id);
    if (error) return { ok: false, error: `Could not save contact: ${error.message}` };
    revalidatePath("/contacts");
    return { ok: true, id: input.id };
  }

  // db/types.ts predates postgrest-js 2.x GenericSchema → cast the final arg
  // only (payload IS typed above). Same rationale as tasks/actions.ts.
  const { data, error } = await supabase
    .from("contacts")
    .insert(payload as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: `Could not create contact: ${error.message}` };

  revalidatePath("/contacts");
  return { ok: true, id: (data as { id: string }).id };
}

/** Soft-delete a contact (staff UPDATE — reversible in the DB, hidden in app). */
export async function removeContact(input: { id: string }): Promise<ContactResult> {
  if (!input.id) return { ok: false, error: "Missing contact." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq("id", input.id);
  if (error) return { ok: false, error: `Could not remove contact: ${error.message}` };
  revalidatePath("/contacts");
  return { ok: true };
}
