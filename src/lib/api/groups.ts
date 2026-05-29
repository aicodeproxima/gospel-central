import { api } from './client';
import type { Group, OrgNode, AuditLogEntry } from '../types';
import type { TeacherMetrics } from '../types/user';

/** Shape returned by GET/PUT /settings/export-import. */
export interface ExportImportSettings {
  /** Node-id (Branch/Group/Team leader user id) → explicit On(true)/Off(false). */
  overrides: Record<string, boolean>;
  /** Global EXPORT_IMPORT_FOR_NON_ADMINS fallback for nodes with no override. */
  default: boolean;
}

export const groupsApi = {
  getGroups() {
    return api.get<Group[]>('/groups');
  },
  getOrgTree() {
    return api.get<OrgNode[]>('/groups/tree');
  },
  /** Per-group CSV export/import overrides + the global default. */
  getExportImportSettings() {
    return api.get<ExportImportSettings>('/settings/export-import');
  },
  /**
   * Set (value true/false) or clear (value null = inherit) one org node's
   * export/import override. Returns the updated settings.
   */
  setExportImportOverride(nodeId: string, value: boolean | null) {
    return api.put<ExportImportSettings>('/settings/export-import', { nodeId, value });
  },
  getTeacherMetrics(userId?: string) {
    const qs = userId ? `?userId=${userId}` : '';
    return api.get<TeacherMetrics[]>(`/metrics/teachers${qs}`);
  },
  getAuditLog(params?: {
    page?: number;
    limit?: number;
    action?: string;
    entityType?: string;
    userId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const clean: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') clean[k] = String(v);
      }
    }
    const qs = Object.keys(clean).length ? new URLSearchParams(clean).toString() : '';
    const limit = params?.limit ?? 25;
    const page = params?.page ?? 1;

    // Defensive coercion — backend has historically shipped two shapes:
    //   1) Bare array: [entry, entry, ...]               (early prototype)
    //   2) Envelope:  { entries, total, page, limit }    (current)
    // Either should give Reports a sane non-crashing response. If the
    // server returns null/undefined or any non-iterable, we fall back
    // to an empty page rather than throw inside Reports' useState/useMemo.
    return api
      .get<unknown>(`/audit-log${qs ? `?${qs}` : ''}`)
      .then((raw): { entries: AuditLogEntry[]; total: number; page: number; limit: number } => {
        if (Array.isArray(raw)) {
          return { entries: raw as AuditLogEntry[], total: raw.length, page, limit };
        }
        if (raw && typeof raw === 'object') {
          const r = raw as Partial<{
            entries: AuditLogEntry[];
            total: number;
            page: number;
            limit: number;
          }>;
          return {
            entries: Array.isArray(r.entries) ? r.entries : [],
            total: typeof r.total === 'number' ? r.total : 0,
            page: typeof r.page === 'number' ? r.page : page,
            limit: typeof r.limit === 'number' ? r.limit : limit,
          };
        }
        return { entries: [], total: 0, page, limit };
      });
  },
};
