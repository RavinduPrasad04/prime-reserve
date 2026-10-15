import type {
  Notification as DbNotification,
  Reservation as DbReservation,
  Resource as DbResource,
  User as DbUser,
} from "@/generated/prisma/client";
import { splitLocal } from "@/lib/dates";
import {
  DEFAULT_CLOSE_TIME,
  DEFAULT_OPEN_DAYS,
  DEFAULT_OPEN_TIME,
  hexToToken,
  MAX_DURATION_MINUTES,
  type NotificationView,
  type Reservation,
  type ReservationStatus,
  type Resource,
  type UserView,
} from "@/lib/domain";

type ReservationWithUser = DbReservation & { user: Pick<DbUser, "name"> };

function toStatus(status: DbReservation["status"]): ReservationStatus {
  if (status === "PENDING") return "pending";
  if (status === "CANCELLED") return "cancelled";
  return "confirmed";
}

export function mapResource(row: DbResource): Resource {
  const token = hexToToken(row.color);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    location: row.location,
    capacity: row.capacity,
    color: token,
    colorHex: row.color,
    status: row.isActive ? "available" : "maintenance",
    isActive: row.isActive,
    openTime: DEFAULT_OPEN_TIME,
    closeTime: DEFAULT_CLOSE_TIME,
    openDays: DEFAULT_OPEN_DAYS,
    requiresApproval: false,
    maxDurationMinutes: MAX_DURATION_MINUTES,
  };
}

export function mapReservation(row: ReservationWithUser): Reservation {
  const start = splitLocal(row.startAt);
  const end = splitLocal(row.endAt);
  return {
    id: row.id,
    resourceId: row.resourceId,
    title: row.title,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    status: toStatus(row.status),
    bookedBy: row.user.name,
    userId: row.userId,
    attendees: row.attendees,
    notes: row.description ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapUser(row: DbUser): UserView {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    department: row.department,
    jobTitle: row.jobTitle,
    createdAt: row.createdAt.toISOString(),
  };
}
export function mapNotification(row: DbNotification): NotificationView {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
    reservationId: row.reservationId,
  };
}
