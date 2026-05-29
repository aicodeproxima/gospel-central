import { api } from './client';
import type { User, UserRole } from '../types';

export interface CreateUserPayload {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
  parentId?: string;
  groupId?: string;
  tags?: string[];
  /** ID of the user creating the account — used for audit logging. */
  createdById: string;
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: UserRole;
  parentId?: string;
  groupId?: string;
  /** Audit attribution. */
  actorId?: string;
}

export interface ResetPasswordResponse {
  /** Plaintext temp password — shown once to the resetter, then forced
   *  through the first-login change flow. The frontend never persists it. */
  tempPassword: string;
  user: User;
}

export const usersApi = {
  getAll() {
    return api.get<User[]>('/users');
  },
  create(payload: CreateUserPayload) {
    return api.post<User>('/users', payload);
  },

  // Phase 3 admin-tab actions.

  /** Update non-username fields (use renameUsername for that). */
  update(id: string, payload: UpdateUserPayload) {
    return api.put<User>(`/users/${id}`, payload);
  },

  deactivate(id: string, actorId: string) {
    return api.post<User>(`/users/${id}/deactivate`, { actorId });
  },

  restore(id: string, actorId: string) {
    return api.post<User>(`/users/${id}/restore`, { actorId });
  },

  /**
   * Generates a one-time temp password and forces a change on first login.
   * Returns the temp password to the resetter ONCE — the frontend should
   * not persist it.
   */
  resetPassword(id: string, actorId: string) {
    return api.post<ResetPasswordResponse>(`/users/${id}/reset-password`, { actorId });
  },

  /** Replace the user's tag set (Teacher / Co-Group Leader / Co-Team Leader / custom). */
  manageTags(id: string, tags: string[], actorId: string) {
    return api.put<User>(`/users/${id}/tags`, { tags, actorId });
  },

  /**
   * Rename a username. Backend validates format (a-z, 0-9, dot, dash,
   * underscore — 3 to 32 chars) and rejects with 409 if taken.
   */
  renameUsername(id: string, username: string, actorId: string) {
    return api.put<User>(`/users/${id}/username`, { username, actorId });
  },

  /**
   * Phase 6: self password change. Used by /first-login when the user
   * has `mustChangePassword: true` (after admin reset or new account
   * creation), and by /settings for ad-hoc changes. Clears the
   * mustChangePassword flag on success.
   */
  changeOwnPassword(id: string, newPassword: string) {
    return api.post<User>(`/users/${id}/change-password`, { newPassword });
  },
};
