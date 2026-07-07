/**
 * Data-access seam.
 *
 * Everything that reads/writes cases goes through this module. It is now backed
 * by LIVE Supabase data (./supabase), read through the RLS-scoped server client
 * so every query respects the logged-in staff session. Callers (pages,
 * components) import only from here and receive the app `Case` shape — they
 * never see DB rows or Supabase.
 *
 * All reads are async (they hit the network / DB). The pure urgency + next-
 * action helpers remain in @/lib/mock (they operate on mapped `Case` objects).
 */

import type { Case, PipelineStage } from "@/lib/types";
import {
  listCases as sbListCases,
  getCase as sbGetCase,
  casesByStage as sbCasesByStage,
  casesByUrgency as sbCasesByUrgency,
} from "./supabase";

/** All cases (unsorted). */
export function listCases(): Promise<Case[]> {
  return sbListCases();
}

/** One case by id, or undefined. */
export function getCase(id: string): Promise<Case | undefined> {
  return sbGetCase(id);
}

/** Cases grouped by pipeline stage (for the Cases list). */
export function casesByStage(): Promise<Map<PipelineStage, Case[]>> {
  return sbCasesByStage();
}

/** Cases sorted by real urgency (for the Today screen). */
export function casesByUrgency(nowDate: Date = new Date()): Promise<Case[]> {
  return sbCasesByUrgency(nowDate);
}
