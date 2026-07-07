/**
 * Local mock data — Phase 0 runs entirely on this. No Supabase yet.
 * Dates are generated relative to "now" so the Today screen always looks alive.
 */

import { Case, PipelineStage, PIPELINE_STAGES } from "./types";
// The pure planning brain (next action + urgency) now lives in @/lib/planning
// as the single source of truth (ROADMAP M2). Re-export it here so existing
// importers of @/lib/mock keep working.
import { urgencyScore, nextActionFor } from "./planning";
export { urgencyScore, nextActionFor };

const H = 3_600_000;
const now = () => Date.now();
const iso = (offsetHours: number) =>
  new Date(now() + offsetHours * H).toISOString();

/* ── Cases at five different pipeline stages ───────────────────────────── */

export const MOCK_CASES: Case[] = [
  {
    id: "c-weiss",
    hebrewName: "חנה בת שרה",
    secularName: "Hannah Weiss",
    dob: "1938-03-14",
    dod: iso(-30),
    placeOfDeath: "Rudolfstiftung, Vienna",
    idOrPassport: "P-AT 4471822",
    nationality: "Austrian",
    status: "documents",
    urgent: true,
    urgencyNote: "Consulate closes before Shabbos",
    cemetery: "Har HaMenuchot, Jerusalem",
    assignedTo: "Motty",
    stageTimestamps: {
      notified: iso(-30),
      collected: iso(-26),
      prepared: iso(-8),
      documents: iso(-5),
    },
    contacts: [
      { contactId: "ct-weiss-family", role: "family" },
      { contactId: "ct-il-consulate", role: "consulate" },
    ],
    documents: [
      {
        id: "d-weiss-permit",
        caseId: "c-weiss",
        type: "il-mfa-transfer-permit",
        title: "IL MFA transfer permit",
        status: "needed",
      },
    ],
    transportLegs: [],
    tasks: [],
  },
  {
    id: "c-goldberger",
    hebrewName: "אברהם בן יעקב",
    secularName: "Abraham Goldberger",
    dob: "1941-11-02",
    dod: iso(-70),
    placeOfDeath: "AKH, Vienna",
    idOrPassport: "P-IL 29866104",
    nationality: "Israeli",
    status: "transport",
    urgent: false,
    cemetery: "Segula, Petach Tikva",
    assignedTo: "Motty",
    stageTimestamps: {
      notified: iso(-70),
      collected: iso(-64),
      prepared: iso(-40),
      documents: iso(-30),
      transport: iso(-4),
    },
    contacts: [
      { contactId: "ct-goldberger-family", role: "family" },
      { contactId: "ct-elal-cargo", role: "airline_cargo" },
    ],
    documents: [
      {
        id: "d-goldberger-permit",
        caseId: "c-goldberger",
        type: "il-mfa-transfer-permit",
        title: "IL MFA transfer permit",
        status: "generated",
      },
    ],
    transportLegs: [
      {
        id: "t-goldberger-air",
        caseId: "c-goldberger",
        type: "air_cargo",
        from: "VIE",
        to: "TLV",
        carrier: "EL AL Cargo",
        flightOrAwb: "LY 364",
        scheduledAt: iso(3),
        status: "in_transit",
        custody: { handedOverAt: iso(-2) },
      },
    ],
    tasks: [],
  },
  {
    id: "c-steiner",
    hebrewName: "יוסף בן משה",
    secularName: "Josef Steiner",
    dob: "1935-06-21",
    dod: iso(-3),
    placeOfDeath: "Hospital Hietzing, Vienna",
    nationality: "Austrian",
    status: "notified",
    urgent: false,
    cemetery: "Zentralfriedhof Tor IV, Vienna",
    assignedTo: "Motty",
    stageTimestamps: { notified: iso(-3) },
    contacts: [
      { contactId: "ct-steiner-family", role: "family" },
      { contactId: "ct-hietzing-morgue", role: "hospital_morgue" },
    ],
    documents: [],
    transportLegs: [],
    tasks: [],
  },
  {
    id: "c-rosenfeld",
    hebrewName: "מרים בת רבקה",
    secularName: "Miriam Rosenfeld",
    dob: "1947-09-08",
    dod: iso(-20),
    placeOfDeath: "Home, Vienna 2",
    idOrPassport: "P-AT 5510934",
    nationality: "Austrian",
    status: "prepared",
    urgent: false,
    cemetery: "Zentralfriedhof Tor I, Vienna",
    assignedTo: "Motty",
    stageTimestamps: {
      notified: iso(-20),
      collected: iso(-16),
      prepared: iso(-2),
    },
    contacts: [
      { contactId: "ct-rosenfeld-family", role: "family" },
      { contactId: "ct-ck-vienna", role: "chevra_kadisha" },
    ],
    documents: [],
    transportLegs: [],
    tasks: [],
  },
  {
    id: "c-katz",
    hebrewName: "דוד בן אהרן",
    secularName: "David Katz",
    dob: "1929-01-30",
    dod: iso(-96),
    placeOfDeath: "SMZ Ost, Vienna",
    idOrPassport: "P-IL 31207755",
    nationality: "Israeli",
    status: "arrived",
    urgent: false,
    cemetery: "Har HaMenuchot, Jerusalem",
    burialPlace: "Chelka 14, row 3",
    assignedTo: "Motty",
    stageTimestamps: {
      notified: iso(-96),
      collected: iso(-90),
      prepared: iso(-70),
      documents: iso(-52),
      transport: iso(-28),
      arrived: iso(-6),
    },
    contacts: [
      { contactId: "ct-katz-family", role: "family" },
      { contactId: "ct-ck-jerusalem", role: "chevra_kadisha" },
    ],
    documents: [
      {
        id: "d-katz-permit",
        caseId: "c-katz",
        type: "il-mfa-transfer-permit",
        title: "IL MFA transfer permit",
        status: "generated",
      },
    ],
    transportLegs: [
      {
        id: "t-katz-air",
        caseId: "c-katz",
        type: "air_cargo",
        from: "VIE",
        to: "TLV",
        carrier: "EL AL Cargo",
        flightOrAwb: "LY 358",
        scheduledAt: iso(-10),
        status: "completed",
        custody: { handedOverAt: iso(-12), receivedAt: iso(-6) },
      },
    ],
    tasks: [],
  },
];

/* ── Urgency sorting — real urgency, not creation date (PLANNING §6) ───── */
/* nextActionFor / urgencyScore now live in @/lib/planning (re-exported above). */

export function casesByUrgency(nowDate: Date = new Date()): Case[] {
  return [...MOCK_CASES].sort(
    (a, b) => urgencyScore(b, nowDate) - urgencyScore(a, nowDate)
  );
}

export function getCase(id: string): Case | undefined {
  return MOCK_CASES.find((c) => c.id === id);
}

export function casesByStage(): Map<PipelineStage, Case[]> {
  const map = new Map<PipelineStage, Case[]>();
  for (const stage of PIPELINE_STAGES) map.set(stage, []);
  for (const c of MOCK_CASES) map.get(c.status)!.push(c);
  return map;
}
