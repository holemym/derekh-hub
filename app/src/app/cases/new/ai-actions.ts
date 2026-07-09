"use server";

/**
 * Death-certificate OCR → New-permit form autofill (ROADMAP M5).
 * Env-gated on ANTHROPIC_API_KEY; requires an active-staff session (the call
 * costs money and the document is sensitive personal data).
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  extractDeathCertificate,
  type ExtractedCertificate,
} from "@/lib/ai/copilot";

const MAX_BYTES = 15 * 1024 * 1024; // stay well under the API's 32MB request cap

export async function aiExtractCertificate(
  formData: FormData,
): Promise<{ ok: boolean; fields?: ExtractedCertificate; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: staff } = await supabase
    .from("staff")
    .select("id")
    .eq("id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (!staff) return { ok: false, error: "Not signed in." };

  const file = formData.get("certificate");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "Choose a certificate file first." };
  if (file.size > MAX_BYTES)
    return { ok: false, error: "File too large (max 15 MB)." };

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  return extractDeathCertificate({ base64, mediaType: file.type });
}
