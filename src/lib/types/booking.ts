export enum BookingStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
}

export enum BookingType {
  UNBAPTIZED_CONTACT = 'unbaptized_contact',
  BAPTIZED_PERSECUTED = 'baptized_persecuted',
  UNBAPTIZED_ZOOM = 'unbaptized_zoom',
  BAPTIZED_IN_PERSON = 'baptized_in_person',
  BAPTIZED_ZOOM = 'baptized_zoom',
  GROUP_ACTIVITIES = 'group_activities',
  TEAM_ACTIVITIES = 'team_activities',
}

export const BOOKING_TYPE_CONFIG: Record<
  BookingType,
  { label: string; color: string; bgColor: string; icon: string; priority: number }
> = {
  [BookingType.UNBAPTIZED_CONTACT]: {
    label: 'Unbaptized Contact',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/20 border-blue-500/40',
    icon: 'UserPlus',
    priority: 1,
  },
  [BookingType.BAPTIZED_PERSECUTED]: {
    label: 'Baptized Persecuted Contact',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500/20 border-red-500/40',
    icon: 'Shield',
    priority: 2,
  },
  [BookingType.UNBAPTIZED_ZOOM]: {
    label: 'Unbaptized Contact Zoom',
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-500/20 border-cyan-500/40',
    icon: 'Video',
    priority: 3,
  },
  [BookingType.BAPTIZED_IN_PERSON]: {
    label: 'Baptized Contact In Person',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/20 border-green-500/40',
    icon: 'Users',
    priority: 4,
  },
  [BookingType.BAPTIZED_ZOOM]: {
    label: 'Baptized Contact Zoom',
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-500/20 border-teal-500/40',
    icon: 'Monitor',
    priority: 5,
  },
  [BookingType.GROUP_ACTIVITIES]: {
    label: 'Group Activities',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-500/20 border-purple-500/40',
    icon: 'UsersRound',
    priority: 6,
  },
  [BookingType.TEAM_ACTIVITIES]: {
    label: 'Team Activities',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/20 border-amber-500/40',
    icon: 'Star',
    priority: 7,
  },
};

export interface Area {
  id: string;
  name: string;
  description?: string;
  rooms: Room[];
  /** Soft-delete flag. When false the area + all its rooms are hidden from
   *  the calendar's room picker but historical bookings are preserved. */
  isActive?: boolean;
}

export interface Room {
  id: string;
  areaId: string;
  name: string;
  capacity: number;
  features?: string[];
  /** Soft-delete flag. When false the room is hidden from the picker but
   *  historical bookings to it are preserved. */
  isActive?: boolean;
  /**
   * ROOM-1: when false, the room is filtered out of the BookingWizard's
   *  picker but otherwise behaves normally — used for service-only spaces
   *  (e.g. Newport News Sanctuary + Fellowship) that exist in the room
   *  list for completeness but never accept Bible-study bookings. Defaults
   *  to true (any room without the flag is bookable).
   */
  isBookable?: boolean;
}

export interface Booking {
  id: string;
  roomId: string;
  areaId: string;
  type: BookingType;
  activity?: string;
  subject?: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  createdBy: string;
  teacherId?: string;
  contactId?: string;
  participants: string[];
  editReason?: string;
  status?: BookingStatus;
  cancelledAt?: string;
  cancelReason?: string;
  cancelledBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookingFormData {
  roomId: string;
  areaId: string;
  type: BookingType;
  activity?: string;
  subject?: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  teacherId?: string;
  contactId?: string;
  participants: string[];
  editReason?: string;
}

/**
 * A reserved time window that prevents bookings. No role can override.
 *
 * Two recurrence kinds:
 *   - 'weekly'  → repeats every week on `dayOfWeek` from `startTime` to `endTime`
 *                 (these are the seeded service times: Tue 8pm, Sat 9am/3pm/8pm)
 *   - 'one-off' → a single absolute window via `startDateTime`/`endDateTime`
 *                 (e.g. Christmas Day all-day, room maintenance, etc.)
 *
 * Two scopes:
 *   - 'global' → applies to every area (every branch's calendar)
 *   - 'area'   → applies only to the area whose id matches `areaId`
 */
export interface BlockedSlot {
  id: string;
  scope: 'global' | 'area';
  /** Required when scope === 'area'. */
  areaId?: string;
  recurrence: 'weekly' | 'one-off';
  /** 0=Sunday, 1=Monday, ..., 6=Saturday. Required for weekly. */
  dayOfWeek?: number;
  /** 'HH:mm' (24-hour). Required for weekly. */
  startTime?: string;
  endTime?: string;
  /** ISO datetime. Required for one-off. */
  startDateTime?: string;
  endDateTime?: string;
  /** Free text shown in the hover tooltip on the calendar block. */
  reason: string;
  createdBy: string;
  createdAt: string;
  /** When true, hides the slot from the calendar without deleting it. */
  isActive?: boolean;
}
