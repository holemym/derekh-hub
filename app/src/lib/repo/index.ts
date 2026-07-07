/**
 * Data-access seam.
 *
 * Everything that reads/writes cases goes through this module. Today it is
 * backed by the local mock (PLANNING §Phase 0). When the Supabase project
 * exists (M0 / db-workstream CONNECT.md), a `supabase.ts` implementation
 * slots in behind the SAME function signatures and this file re-exports it —
 * callers (pages, components) never change.
 *
 * Keep this the ONLY place the app imports from `@/lib/mock`.
 */

import type { Case, PipelineStage } from "@/lib/types";
import {
  MOCK_CASES,
  casesByStage as mockCasesByStage,
  casesByUrgency as mockCasesByUrgency,
  getCase as mockGetCase,
} from "@/lib/mock";

// TODO(M0): swap the mock-backed impls below for a Supabase-backed repo.
//   e.g. `import * as impl from "./supabase";` guarded by an env flag:
//     const useSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
//   The Supabase impl must return the same `Case` shape (map DB rows → Case).
//   Until a project exists (see db/CONNECT.md) we stay on the mock.

/** All cases (unsorted). */
export function listCases(): Case[] {
  return MOCK_CASES;
}

/** One case by id, or undefined. */
export function getCase(id: string): Case | undefined {
  return mockGetCase(id);
}

/** Cases grouped by pipeline stage (for the Cases list). */
export function casesByStage(): Map<PipelineStage, Case[]> {
  return mockCasesByStage();
}

/** Cases sorted by real urgency (for the Today screen). */
export function casesByUrgency(nowDate: Date = new Date()): Case[] {
  return mockCasesByUrgency(nowDate);
}
