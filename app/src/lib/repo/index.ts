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

import type { Case, PipelineStage, Task } from "@/lib/types";
import {
  listCases as sbListCases,
  getCase as sbGetCase,
  casesByStage as sbCasesByStage,
  casesByUrgency as sbCasesByUrgency,
  openCasesByUrgency as sbOpenCasesByUrgency,
  listOpenTasks as sbListOpenTasks,
  tasksForCase as sbTasksForCase,
  activityForCase as sbActivityForCase,
  listTransportLegs as sbListTransportLegs,
  moneyForCase as sbMoneyForCase,
  moneyOverview as sbMoneyOverview,
  contactCardsForCase as sbContactCardsForCase,
  messagesForCase as sbMessagesForCase,
  type ActivityEntry,
  type TransportLegWithCase,
  type CaseMoney,
  type MoneyOverview,
  type InvoiceWithCase,
} from "./supabase";
import type { CaseContactCard, Message } from "@/lib/types";

export type {
  ActivityEntry,
  TransportLegWithCase,
  CaseMoney,
  MoneyOverview,
  InvoiceWithCase,
};

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

/** Open cases only (status != 'buried'), urgency-sorted — the Today feed. */
export function openCasesByUrgency(nowDate: Date = new Date()): Promise<Case[]> {
  return sbOpenCasesByUrgency(nowDate);
}

/** All open tasks (case + standalone), due-sorted — the Today "Due soon" list. */
export function listOpenTasks(): Promise<Task[]> {
  return sbListOpenTasks();
}

/** Tasks for one case (open + done), due-sorted. */
export function tasksForCase(caseId: string): Promise<Task[]> {
  return sbTasksForCase(caseId);
}

/** Every transport leg across all cases, with niftar identity (dispatch board). */
export function listTransportLegs(): Promise<TransportLegWithCase[]> {
  return sbListTransportLegs();
}

/** Most-recent activity_log entries for one case (newest first). */
export function activityForCase(
  caseId: string,
  limit?: number,
): Promise<ActivityEntry[]> {
  return sbActivityForCase(caseId, limit);
}

/** A case's invoices + expenses + roll-up (per-case Money section). */
export function moneyForCase(caseId: string): Promise<CaseMoney> {
  return sbMoneyForCase(caseId);
}

/** Every invoice across all cases + a summary (the /money overview). */
export function moneyOverview(): Promise<MoneyOverview> {
  return sbMoneyOverview();
}

/** Comms-ready contact cards for one case (family first). */
export function contactCardsForCase(caseId: string): Promise<CaseContactCard[]> {
  return sbContactCardsForCase(caseId);
}

/** Logged messages for one case, newest first (comms history). */
export function messagesForCase(caseId: string): Promise<Message[]> {
  return sbMessagesForCase(caseId);
}
