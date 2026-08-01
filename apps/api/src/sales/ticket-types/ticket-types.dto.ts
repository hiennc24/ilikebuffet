/**
 * DTOs for ticket-type CRUD (VG-01).
 */

export interface CreateTicketTypeDto {
  name: string;
  description?: string;
  displayOrder?: number;
  /** Hex or Tailwind token, e.g. "#3B82F6". */
  color?: string;
  /** Free ticket: price always 0, still counts toward guest total (VG-01.2). */
  isFree?: boolean;
}

export interface UpdateTicketTypeDto {
  name?: string;
  description?: string;
  displayOrder?: number;
  color?: string;
  isFree?: boolean;
}

export interface TicketTypeListQuery {
  includeInactive?: boolean;
}
