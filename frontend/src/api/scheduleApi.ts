import { apiClient } from "./client";

// Mirrors server limits (Schedule.*_MAX_LENGTH, Schedule.COLOR_PATTERN).
export const SCHEDULE_TITLE_MAX_LENGTH = 200;
export const SCHEDULE_DESCRIPTION_MAX_LENGTH = 5_000;
export const SCHEDULE_LOCATION_MAX_LENGTH = 300;
export const SCHEDULE_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const SCHEDULE_PAGE_SIZE = 20;

export const SCHEDULE_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const SCHEDULE_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];
export type SchedulePriority = (typeof SCHEDULE_PRIORITIES)[number];

export interface UserRef {
  id: number;
  loginIdentifier: string;
}

/**
 * startAt/endAt are zone-less wall-clock times ("2026-09-28T10:00:00", service time zone);
 * createdAt/updatedAt are UTC instants. Text fields are plain text: render them as text only.
 */
export interface ScheduleSummary {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  status: ScheduleStatus;
  priority: SchedulePriority;
  assignee: UserRef | null;
  location: string | null;
  isPublic: boolean;
  color: string | null;
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleDetail extends ScheduleSummary {
  description: string | null;
  updatedBy: UserRef;
  version: number;
  /** UX hint only; the server re-checks ownership on update/delete. */
  editable: boolean;
}

export interface SchedulePage {
  content: ScheduleSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ScheduleSearch {
  keyword?: string;
  /** yyyy-MM-dd */
  from?: string;
  /** yyyy-MM-dd */
  to?: string;
  status?: ScheduleStatus;
  priority?: SchedulePriority;
  assigneeId?: number;
  createdById?: number;
}

export interface ScheduleListRequest extends ScheduleSearch {
  page: number;
  size: number;
  /** "field,asc|desc" */
  sort?: string;
}

export interface ScheduleInput {
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  status: ScheduleStatus;
  priority: SchedulePriority;
  assigneeId: number | null;
  location: string | null;
  isPublic: boolean;
  color: string | null;
  /** Required for update (optimistic lock). */
  version?: number;
}

export interface ConflictCheck {
  assigneeId: number;
  startAt: string;
  endAt: string;
  excludeId?: number;
}

export interface ConflictResult {
  conflict: boolean;
  items: Array<{ id: number; title: string; startAt: string; endAt: string }>;
  /** Overlapping schedules the current user may not see. */
  hiddenCount: number;
}

export interface CalendarRequest {
  from: string;
  to: string;
  status?: ScheduleStatus;
  assigneeId?: number;
}

export interface CalendarResult {
  /** Oldest start first. */
  items: ScheduleSummary[];
  /** More schedules matched than the server returns (500). */
  truncated: boolean;
}

function query(values: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

export const scheduleApi = {
  list(request: ScheduleListRequest, signal?: AbortSignal): Promise<SchedulePage> {
    return apiClient.get<SchedulePage>(`/api/schedules?${query(request)}`, signal);
  },

  get(id: number, signal?: AbortSignal): Promise<ScheduleDetail> {
    return apiClient.get<ScheduleDetail>(`/api/schedules/${id}`, signal);
  },

  create(input: ScheduleInput): Promise<ScheduleDetail> {
    return apiClient.post<ScheduleDetail>("/api/schedules", input);
  },

  update(id: number, input: ScheduleInput): Promise<ScheduleDetail> {
    return apiClient.put<ScheduleDetail>(`/api/schedules/${id}`, input);
  },

  remove(id: number): Promise<void> {
    return apiClient.delete<void>(`/api/schedules/${id}`);
  },

  conflicts(check: ConflictCheck, signal?: AbortSignal): Promise<ConflictResult> {
    return apiClient.get<ConflictResult>(`/api/schedules/conflicts?${query(check)}`, signal);
  },

  /** Visible schedules overlapping [from, to] (yyyy-MM-dd, at most 62 days). */
  calendar(request: CalendarRequest, signal?: AbortSignal): Promise<CalendarResult> {
    return apiClient.get<CalendarResult>(`/api/schedules/calendar?${query(request)}`, signal);
  },

  assignees(signal?: AbortSignal): Promise<UserRef[]> {
    return apiClient.get<UserRef[]>("/api/schedules/assignees", signal);
  },
};
