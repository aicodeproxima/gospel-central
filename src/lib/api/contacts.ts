import { api } from './client';
import type { Contact, User, UserRole } from '../types';

export interface ConvertContactPayload {
  role: UserRole;
  parentId?: string;
  groupId?: string;
  actorId?: string;
}

export interface ConvertContactResponse {
  user: User;
  contact: Contact;
}

export const contactsApi = {
  getContacts(params?: {
    search?: string;
    type?: string;
    status?: string;
    stage?: string;
    sort?: string;
    sortDir?: string;
  }) {
    const clean: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') clean[k] = v;
      }
    }
    const qs = Object.keys(clean).length ? new URLSearchParams(clean).toString() : '';
    return api.get<Contact[]>(`/contacts${qs ? `?${qs}` : ''}`);
  },
  getContact(id: string) {
    return api.get<Contact>(`/contacts/${id}`);
  },
  createContact(data: Partial<Contact>) {
    return api.post<Contact>('/contacts', data);
  },
  updateContact(id: string, data: Partial<Contact>) {
    return api.put<Contact>(`/contacts/${id}`, data);
  },
  deleteContact(id: string) {
    return api.delete<void>(`/contacts/${id}`);
  },
  /**
   * CONT-5: convert a contact into a full User account. Returns the
   * newly-created user + the patched contact (status=converted,
   * convertedToUserId set).
   */
  convertToUser(id: string, data: ConvertContactPayload) {
    return api.post<ConvertContactResponse>(`/contacts/${id}/convert`, data);
  },
};
