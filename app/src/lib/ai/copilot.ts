import "server-only";

/**
 * AI copilot seam (ROADMAP M5) — Claude API, env-gated on ANTHROPIC_API_KEY.
 * Without the key every feature is hidden in the UI and every call here
 * returns a clean error; nothing else in the app depends on this module.
 *
 * Four capabilities, all single Messages-API calls on claude-opus-4-8 with
 * adaptive thinking:
 *  - draftConsulateEmail — the repatriation notification/request email
 *  - summarizeCase       — a short operational case summary
 *  - dailyBrief          — the "urgent before Shabbos" morning brief (Today)
 *  - extractDeathCertificate — vision OCR of a certificate (image or PDF)
 *    → structured PermitForm fields via output_config.format (json_schema)
 *
 * The niftar's data is sent to Anthropic's API when these run — GDPR: this is
 * processing by a processor under the operator's instruction; keep the key
 * out of the client and only send fields the task needs.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface AiResult {
  ok: boolean;
  text?: string;
  error?: string;
}

function client(): Anthropic {
  return new Anthropic(); // reads ANTHROPIC_API_KEY
}

function firstText(content: Anthropic.ContentBlock[]): string {
  for (const block of content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

async function complete(system: string, user: string): Promise<AiResult> {
  if (!aiConfigured()) return { ok: false, error: "AI is not configured." };
  try {
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = firstText(response.content).trim();
    if (!text) return { ok: false, error: "The model returned no text." };
    return { ok: true, text };
  } catch (e) {
    if (e instanceof Anthropic.APIError)
      return { ok: false, error: `Claude API ${e.status}: ${e.message}` };
    return { ok: false, error: e instanceof Error ? e.message : "AI call failed." };
  }
}

const HOUSE_CONTEXT =
  "You assist the burial/repatriation operations hub of IKG Vienna " +
  "(Israelitische Kultusgemeinde Wien; funeral director Mordechai Hammer). " +
  "The work is death care: be accurate, dignified and unadorned. Never invent " +
  "facts — where a detail is missing, leave an explicit [TODO: …] placeholder.";

/** Draft the consulate email requesting/announcing a body transfer. */
export function draftConsulateEmail(input: {
  caseContext: string;
  consulateName?: string;
  locale: string;
}): Promise<AiResult> {
  const lang = input.locale === "de" ? "German" : "English";
  return complete(
    `${HOUSE_CONTEXT} You draft formal consular correspondence for the transfer of deceased persons.`,
    `Draft the email to ${input.consulateName || "the relevant consulate"} requesting the documents/permission needed to repatriate the deceased. Write in ${lang}. Formal but concise; include a subject line ("Subject: …" on the first line); reference the case facts below; list the attachments we would typically enclose (death certificate, transfer permit, passport copy). Output ONLY the email text.\n\nCase facts:\n${input.caseContext}`,
  );
}

/** Short operational summary of one case (for the case detail Copilot box). */
export function summarizeCase(input: {
  caseContext: string;
  locale: string;
}): Promise<AiResult> {
  const lang = input.locale === "de" ? "German" : "English";
  return complete(
    `${HOUSE_CONTEXT} You write short operational case summaries for staff.`,
    `Summarize this case for a colleague taking over: current stage, what has been done, what is outstanding, and the single next action. Max ~120 words, in ${lang}. Plain prose, no headings.\n\nCase data:\n${input.caseContext}`,
  );
}

/** The morning brief for Today — what must happen before Shabbos/chag. */
export function dailyBrief(input: {
  briefContext: string;
  locale: string;
}): Promise<AiResult> {
  const lang = input.locale === "de" ? "German" : "English";
  return complete(
    `${HOUSE_CONTEXT} You write the operator's morning brief. Jewish-calendar pressure matters: work that cannot happen on Shabbos/chag must be flagged to complete beforehand.`,
    `Write today's brief in ${lang}: 1) anything time-critical before the next Shabbos/chag, 2) per open case the one next action, 3) overdue/soon tasks worth attention. Short bullet lines, most urgent first, max ~150 words.\n\nOperational data:\n${input.briefContext}`,
  );
}

/* ── Death-certificate OCR → PermitForm fields (structured output) ──────── */

/** The subset of PermitForm a certificate can populate. All optional. */
export interface ExtractedCertificate {
  surname?: string;
  firstname?: string;
  dob?: string;
  pob?: string;
  address?: string;
  nationality?: string;
  dod?: string;
  pod?: string;
  cause?: string;
  icd?: string;
}

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    surname: { type: "string", description: "Family name of the deceased" },
    firstname: { type: "string", description: "Given name(s)" },
    dob: { type: "string", description: "Date of birth, ISO YYYY-MM-DD" },
    pob: { type: "string", description: "Place of birth" },
    address: { type: "string", description: "Last residential address" },
    nationality: { type: "string", description: "Nationality/citizenship" },
    dod: { type: "string", description: "Date of death, ISO YYYY-MM-DD" },
    pod: { type: "string", description: "Place of death" },
    cause: { type: "string", description: "Cause of death as written" },
    icd: { type: "string", description: "ICD-10 code if printed" },
  },
  required: [],
  additionalProperties: false,
} as const;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

/**
 * OCR a death certificate (photo or PDF) into PermitForm fields.
 * Only fields actually legible on the document are returned.
 */
export async function extractDeathCertificate(input: {
  base64: string;
  mediaType: string;
}): Promise<{ ok: boolean; fields?: ExtractedCertificate; error?: string }> {
  if (!aiConfigured()) return { ok: false, error: "AI is not configured." };

  const isPdf = input.mediaType === "application/pdf";
  const isImage = (IMAGE_TYPES as readonly string[]).includes(input.mediaType);
  if (!isPdf && !isImage)
    return { ok: false, error: "Upload a photo (JPG/PNG) or PDF of the certificate." };

  const docBlock: Anthropic.ContentBlockParam = isPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: input.base64 },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: input.mediaType as ImageMediaType,
          data: input.base64,
        },
      };

  try {
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system:
        `${HOUSE_CONTEXT} You transcribe official death certificates (German/English/Hebrew) precisely. ` +
        "Omit any field you cannot read with confidence — never guess. Dates as ISO YYYY-MM-DD.",
      output_config: {
        format: { type: "json_schema", schema: EXTRACT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            docBlock,
            {
              type: "text",
              text: "Extract the deceased person's details from this death certificate.",
            },
          ],
        },
      ],
    });
    const raw = firstText(response.content);
    const parsed = JSON.parse(raw) as ExtractedCertificate;
    // Drop empty strings so the client only merges real values.
    const fields: ExtractedCertificate = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim() !== "")
        fields[k as keyof ExtractedCertificate] = v.trim();
    }
    return { ok: true, fields };
  } catch (e) {
    if (e instanceof Anthropic.APIError)
      return { ok: false, error: `Claude API ${e.status}: ${e.message}` };
    return { ok: false, error: e instanceof Error ? e.message : "Extraction failed." };
  }
}
