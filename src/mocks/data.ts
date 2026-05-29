/**
 * Mock data entry point. Currently re-exports the "Church Week" hypothetical
 * scenario from ./scenario-church-week.ts.
 *
 * To switch back to minimal test data or use a different scenario, change
 * the imports below. To disable mocks entirely in production, set
 * NEXT_PUBLIC_MOCK_API=false — MSW will stop intercepting and this file
 * will no longer be loaded.
 */

import {
  scenarioUsers,
  scenarioAreas,
  scenarioBookings,
  scenarioBlockedSlots,
  scenarioContacts,
  scenarioOrgTree,
  scenarioTeacherMetrics,
  scenarioAuditLog,
} from './scenario-church-week';

export const mockUsers = scenarioUsers;
export const mockAreas = scenarioAreas;
export const mockBookings = scenarioBookings;
export const mockBlockedSlots = scenarioBlockedSlots;
export const mockContacts = scenarioContacts;
export const mockOrgTree = scenarioOrgTree;
export const mockTeacherMetrics = scenarioTeacherMetrics;
export const mockAuditLog = scenarioAuditLog;
