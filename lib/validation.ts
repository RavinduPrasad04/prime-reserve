import {
  addDays,
  getDayOfWeek,
  isValidISODate,
  minutesToTime,
  reservationEndDate,
  timeToMinutes,
  toISODate,
} from "@/lib/dates";
import {
  DEFAULT_CLOSE_TIME,
  DEFAULT_DURATION_MIN,
  DEFAULT_OPEN_DAYS,
  DEFAULT_OPEN_TIME,
  GRID_END_MIN,
  GRID_START_MIN,
  MAX_DURATION_MINUTES,
  SLOT_MIN,
  type BookingBlockView,
  type BookingSettingsView,
  type FieldErrors,
  type Reservation,
  type ReservationInput,
  type Resource,
} from "@/lib/domain";

export const DAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

export type BlockReason = "past" | "maintenance" | "closed" | "outside-hours" | "booked" | "admin-blocked" | "weekend" | "duration";

export const BLOCK_REASON_LABEL: Record<BlockReason, string> = {
  past: "This time has passed",
  maintenance: "Resource unavailable",
  closed: "Resource is closed this day",
  "outside-hours": "Outside booking hours",
  booked: "Already reserved",
  "admin-blocked": "Blocked by an administrator",
  weekend: "Weekend bookings are restricted",
  duration: "Exceeds the maximum booking duration",
};

export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

export function isInPast(date: string, startMin: number, now: Date): boolean {
  const today = toISODate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return date < today || (date === today && startMin < nowMin);
}

export function isReservationEnded(r: Reservation, now: Date): boolean {
  const endDate = reservationEndDate(r.date, r.startTime, r.endTime);
  return isInPast(endDate, timeToMinutes(r.endTime) - 1, now);
}

function dayOffset(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function findConflicts(
  reservations: Reservation[],
  resourceId: string,
  date: string,
  startMin: number,
  endMin: number,
  ignoreId?: string,
): Reservation[] {
  return reservations.filter(
    (r) => {
      if (r.id === ignoreId || r.status === "cancelled" || r.resourceId !== resourceId) return false;
      const offset = dayOffset(date, r.date) * 1440;
      const reservationStart = offset + timeToMinutes(r.startTime);
      const endTime = timeToMinutes(r.endTime);
      const reservationEnd = offset + (endTime <= timeToMinutes(r.startTime) ? endTime + 1440 : endTime);
      return overlaps(startMin, endMin, reservationStart, reservationEnd);
    },
  );
}

export function getBlockReason(
  resource: Resource,
  date: string,
  startMin: number,
  endMin: number,
  reservations: Reservation[],
  now: Date,
  ignoreId?: string,
  rules?: { bookingBlocks?: BookingBlockView[]; settings?: BookingSettingsView },
): BlockReason | null {
  if (isInPast(date, startMin, now)) return "past";
  if (resource.status === "maintenance") return "maintenance";
  if (endMin - startMin > resource.maxDurationMinutes) return "duration";
  const endDate = endMin > 1440 ? addDays(date, 1) : date;
  const bookingDays = endDate === date ? [date] : [date, endDate];
  if (bookingDays.some((bookingDay) => !resource.openDays.includes(getDayOfWeek(bookingDay)))) return "closed";
  if (bookingDays.some((bookingDay) => {
    const day = getDayOfWeek(bookingDay);
    return (day === 6 && rules?.settings?.restrictSaturday) || (day === 0 && rules?.settings?.restrictSunday);
  })) {
    return "weekend";
  }
  if (
    rules?.bookingBlocks?.some(
      (block) => bookingDays.includes(block.date) && (block.resourceId === null || block.resourceId === resource.id),
    )
  ) {
    return "admin-blocked";
  }
  if (
    startMin < timeToMinutes(resource.openTime) ||
    startMin >= timeToMinutes(resource.closeTime) ||
    (endMin > 1440 && timeToMinutes(resource.closeTime) < 1440) ||
    (endMin > 1440 ? endMin - 1440 > timeToMinutes(resource.closeTime) : endMin > timeToMinutes(resource.closeTime))
  ) {
    return "outside-hours";
  }
  if (findConflicts(reservations, resource.id, date, startMin, endMin, ignoreId).length) {
    return "booked";
  }
  return null;
}

export function suggestEndMinutes(
  resource: Resource,
  date: string,
  startMin: number,
  reservations: Reservation[],
  desired = DEFAULT_DURATION_MIN,
): number {
  let end = Math.min(startMin + desired, timeToMinutes(resource.closeTime));
  for (const r of reservations) {
    if (r.status === "cancelled" || r.resourceId !== resource.id || r.date !== date) continue;
    const s = timeToMinutes(r.startTime);
    if (s >= startMin && s < end) end = s;
  }
  return Math.max(end, startMin + SLOT_MIN);
}

export function findFirstFreeSlot(
  resource: Resource,
  date: string,
  reservations: Reservation[],
  now: Date,
): number | null {
  const open = timeToMinutes(resource.openTime);
  const close = timeToMinutes(resource.closeTime);
  for (let s = open; s + SLOT_MIN <= close; s += SLOT_MIN) {
    if (!getBlockReason(resource, date, s, s + SLOT_MIN, reservations, now)) return s;
  }
  return null;
}

type ValidationContext = {
  resources: Resource[];
  reservations: Reservation[];
  now: Date;
  original?: Reservation;
  bookingBlocks?: BookingBlockView[];
  settings?: BookingSettingsView;
};

export function validateReservationInputShape(value: unknown): FieldErrors {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { form: "Invalid reservation details." };
  }

  const input = value as Record<string, unknown>;
  const errors: FieldErrors = {};
  if (typeof input.resourceId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.resourceId)) {
    errors.resourceId = "Choose a valid resource.";
  }
  if (typeof input.title !== "string" || input.title.length > 100) {
    errors.title = "Enter a valid reservation title.";
  }
  if (typeof input.date !== "string" || !isValidISODate(input.date)) errors.date = "Choose a valid date.";
  if (typeof input.startTime !== "string" || !/^([01]\d|2[0-3]):(00|15|30|45)$/.test(input.startTime)) {
    errors.startTime = "Choose a valid start time.";
  }
  if (typeof input.endTime !== "string" || !/^([01]\d|2[0-3]):(00|15|30|45)$/.test(input.endTime)) {
    errors.endTime = "Choose a valid end time.";
  }
  if (typeof input.attendees !== "number" || !Number.isSafeInteger(input.attendees) || input.attendees < 1) {
    errors.attendees = "Enter a valid attendee count.";
  }
  if (typeof input.notes !== "string" || input.notes.length > 500) errors.notes = "Enter valid notes.";
  return errors;
}

export function validateReservation(input: ReservationInput, ctx: ValidationContext): FieldErrors {
  const errors: FieldErrors = {};
  const title = input.title.trim();

  if (!title) errors.title = "Enter a title for this reservation.";
  else if (title.length < 3) errors.title = "Title must be at least 3 characters.";
  else if (title.length > 100) errors.title = "Title must be 100 characters or fewer.";

  if (input.notes.length > 500) errors.notes = "Notes must be 500 characters or fewer.";

  const resource = ctx.resources.find((r) => r.id === input.resourceId);
  if (!resource) errors.resourceId = "Choose a resource.";
  else if (resource.status === "maintenance") {
    errors.resourceId = `${resource.name} is unavailable and can't be reserved.`;
  }

  const dateOk = isValidISODate(input.date);
  if (!dateOk) errors.date = "Choose a valid date.";

  const timeRe = /^\d{2}:\d{2}$/;
  const startOk = timeRe.test(input.startTime);
  const endOk = timeRe.test(input.endTime);
  if (!startOk) errors.startTime = "Choose a start time.";
  if (!endOk) errors.endTime = "Choose an end time.";

  const start = startOk ? timeToMinutes(input.startTime) : 0;
  const end = endOk ? timeToMinutes(input.endTime) : 0;
  if (startOk && endOk && end === start) errors.endTime = "End time must be different from the start time.";

  if (!Number.isInteger(input.attendees) || input.attendees < 1) {
    errors.attendees = "Enter at least 1 attendee.";
  } else if (resource && input.attendees > resource.capacity) {
    errors.attendees = `${resource.name} holds up to ${resource.capacity}.`;
  }

  const endAbsolute = endOk && startOk && end < start ? end + 1440 : end;
  const duration = endAbsolute - start;
  const endDate = dateOk && endAbsolute > 1440 ? addDays(input.date, 1) : input.date;
  const timesOk = startOk && endOk && duration > 0;
  if (resource && resource.status !== "maintenance" && dateOk && timesOk) {
    const open = timeToMinutes(resource.openTime);
    const close = timeToMinutes(resource.closeTime);
    const orig = ctx.original;
    const unchanged =
      !!orig &&
      orig.date === input.date &&
      orig.startTime === input.startTime &&
      orig.endTime === input.endTime;

    if (duration > resource.maxDurationMinutes) {
      errors.endTime = `${resource.name} can be booked for at most ${Math.floor(resource.maxDurationMinutes / 60)} hours.`;
    }
    const bookingDays = endDate === input.date ? [input.date] : [input.date, endDate];
    const closedDate = bookingDays.find((day) => !resource.openDays.includes(getDayOfWeek(day)));
    const weekendRestrictedDate = bookingDays.find((day) => {
      const weekday = getDayOfWeek(day);
      return (weekday === 6 && ctx.settings?.restrictSaturday) || (weekday === 0 && ctx.settings?.restrictSunday);
    });
    const adminBlocked = ctx.bookingBlocks?.find(
      (block) => bookingDays.includes(block.date) && (block.resourceId === null || block.resourceId === resource.id),
    );
    if (closedDate) {
      errors.date = `${resource.name} isn't available on ${DAY_NAMES[getDayOfWeek(closedDate)]}.`;
    } else if (weekendRestrictedDate) {
      errors.date = `${DAY_NAMES[getDayOfWeek(weekendRestrictedDate)].slice(0, -1)} bookings are restricted by an administrator.`;
    } else if (adminBlocked) {
      errors.date = adminBlocked.reason
        ? `This date is blocked: ${adminBlocked.reason}`
        : "This date is blocked by an administrator.";
    } else if (
      start < open ||
      start >= close ||
      (endAbsolute > 1440 && close < 1440) ||
      (endAbsolute > 1440 ? endAbsolute - 1440 > close : endAbsolute > close)
    ) {
      errors.startTime = `${resource.name} can be booked ${minutesToTime(open)}–${minutesToTime(close)}.`;
    } else {
      if (!unchanged && isInPast(input.date, start, ctx.now)) {
        errors.startTime = "That start time has already passed.";
      }
      const clash = findConflicts(
        ctx.reservations,
        resource.id,
        input.date,
        start,
        endAbsolute,
        orig?.id,
      )[0];
      if (clash) {
        errors.form = `${resource.name} is already reserved for “${clash.title}” (${clash.startTime}–${clash.endTime}). Pick another time or resource.`;
      }
    }
  }

  return errors;
}

export const hasErrors = (e: FieldErrors) => Object.keys(e).length > 0;

export function mondayOfCurrentWeek(from = new Date()) {
  return addDays(toISODate(from), -((from.getDay() + 6) % 7));
}

export { DEFAULT_CLOSE_TIME, DEFAULT_OPEN_DAYS, DEFAULT_OPEN_TIME, GRID_END_MIN, GRID_START_MIN, MAX_DURATION_MINUTES };
