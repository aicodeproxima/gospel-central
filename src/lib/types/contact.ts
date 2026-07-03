import { BookingType } from './booking';

export enum ContactStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  CONVERTED = 'converted',
}

/**
 * The 6 contact statuses (2026-07 overhaul, Decision 2) — THE single visible
 * classification everywhere (card badges, kanban columns, filters, pipelines).
 * Old values migrated: regular_study→unbaptized, progressing→potential.
 * NEEDS_HELP is manual-only (never set automatically). Auto-rule: a contact in
 * FIRST_STUDY is promoted to UNBAPTIZED once 2 studies are Completed (one-way;
 * manual changes afterwards are respected — see handlers).
 */
export enum PipelineStage {
  FIRST_STUDY = 'first_study',
  UNBAPTIZED = 'unbaptized',
  POTENTIAL = 'potential',
  BAPTISM_READY = 'baptism_ready',
  NEEDS_HELP = 'needs_help',
  BAPTIZED = 'baptized',
}

/** Packet-locked colors: grey / grey / yellow / blue / red / green. */
export const PIPELINE_STAGE_CONFIG: Record<PipelineStage, { label: string; color: string; order: number }> = {
  [PipelineStage.FIRST_STUDY]: { label: 'First Study', color: 'bg-gray-400', order: 0 },
  [PipelineStage.UNBAPTIZED]: { label: 'Unbaptized', color: 'bg-gray-500', order: 1 },
  [PipelineStage.POTENTIAL]: { label: 'Potential', color: 'bg-yellow-400', order: 2 },
  [PipelineStage.BAPTISM_READY]: { label: 'Baptism Ready', color: 'bg-blue-400', order: 3 },
  [PipelineStage.NEEDS_HELP]: { label: 'Needs Help', color: 'bg-red-500', order: 4 },
  [PipelineStage.BAPTIZED]: { label: 'Baptized', color: 'bg-green-400', order: 5 },
};

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  /** User-facing group/branch name this contact belongs to (e.g. "ODU", "Branch 1") */
  groupName?: string;
  type: BookingType;
  status: ContactStatus;
  pipelineStage: PipelineStage;
  assignedTeacherId?: string;
  /** Up to 3 brothers/sisters who preached with this contact. Stores teacher/user IDs. */
  preachingPartnerIds?: (string | null)[];
  notes?: string;
  totalSessions: number;
  lastSessionDate?: string;
  currentlyStudying?: boolean;
  currentStep?: number;
  currentSubject?: string;
  /** List of subject titles this contact has studied. */
  subjectsStudied?: string[];
  convertedToUserId?: string;
  /** Post-conversion retention deadline (ISO date, ~6 months after convert, or
   *  group-leader's discretion). The read handlers flag records past this date;
   *  no background job exists in the mock. */
  retainUntil?: string;
  /** Chronological history of interactions and stage changes. */
  timeline?: TimelineEntry[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEntry {
  date: string;
  action: 'created' | 'stage_change' | 'session' | 'partner_change' | 'note' | 'updated';
  details: string;
  userId: string;
  userName: string;
}
