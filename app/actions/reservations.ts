"use server";

import {
  NotificationType,
  Prisma,
  ReservationStatus,
} from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { combineLocal, combineReservationTimes, reservationEndDate, toISODate } from "@/lib/dates";
import type { DateRange } from "@/lib/dates";
import { canManageReservation, type BookingBlockView, type BookingSettingsView, type FieldErrors, type Reservation, type ReservationInput, type ServiceResult } from "@/lib/domain";
import { mapReservation, mapResource } from "@/lib/mappers";
import { prisma } from "@/lib/prisma";
import {
  hasErrors,
  isReservationEnded,
  validateReservation,
  validateReservationInputShape,
} from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { BLOCK_REASON_LABEL, getBlockReason } from "@/lib/validation";
import { isValidISODate, timeToMinutes } from "@/lib/dates";
import type { ResourceType } from "@/lib/domain";

// Creates a consistent error response for reservation actions.
function fail(
  message: string,
  code: "VALIDATION" | "CONFLICT" | "NOT_FOUND" | "UNKNOWN" | "UNAUTHORIZED" | "FORBIDDEN" = "VALIDATION",
  fields?: FieldErrors,
): ServiceResult<never> {
  return { ok: false, error: { code, message, fields } };
}

// Refreshes pages affected by reservation changes.
function revalidateBookingViews() {
  revalidatePath("/calendar");
  revalidatePath("/reservations");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
}

// Converts authentication and authorization errors into service responses.
function authFail(e: unknown): ServiceResult<never> | null {
  if (e instanceof Error && e.message === "UNAUTHORIZED") {
    return fail("Please sign in.", "UNAUTHORIZED");
  }
  if (e instanceof Error && e.message === "FORBIDDEN") {
    return fail("You don't have permission to do that.", "FORBIDDEN");
  }
  return null;
}

const includeUser = { user: { select: { name: true } } } as const;
const resourceTypes: ResourceType[] = ["ROOM", "STUDIO", "EQUIPMENT", "VEHICLE"];


// Defines the filters required to check resource availability.
export type AvailabilityQuery = {
  resourceType: ResourceType | "ALL";
  date: string;
  startTime: string;
  endTime: string;
};

// Describes a resource and its availability for the requested time range.
export type AvailabilityResult = {
  id: string;
  name: string;
  type: ResourceType;
  capacity: number;
  available: boolean;
  reason: string | null;
};


// Checks resource availability against existing reservations and booking restrictions.
export async function checkAvailabilityAction(input: unknown): Promise<ServiceResult<AvailabilityResult[]>> {
  try {
    await requireUser();
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return fail("Enter valid availability details.");
    }
    const value = input as Record<string, unknown>;
    if (
      (value.resourceType !== "ALL" && (typeof value.resourceType !== "string" || !resourceTypes.includes(value.resourceType as ResourceType))) ||
      typeof value.date !== "string" ||
      !isValidISODate(value.date) ||
      typeof value.startTime !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime) ||
      typeof value.endTime !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.endTime) ||
      timeToMinutes(value.endTime) === timeToMinutes(value.startTime) ||
      timeToMinutes(value.startTime) % 15 !== 0 ||
      timeToMinutes(value.endTime) % 15 !== 0
    ) {
      return fail("Choose a valid resource type, date, and time range.");
    }

    const { startAt, endAt } = combineReservationTimes(value.date, value.startTime, value.endTime);
    const endDate = reservationEndDate(value.date, value.startTime, value.endTime);
    const resourceRows = await prisma.resource.findMany({
      where: value.resourceType === "ALL" ? {} : { type: value.resourceType as ResourceType },
      orderBy: { name: "asc" },
    });
    if (resourceRows.length === 0) return { ok: true, data: [] };

    const reservationRows = await prisma.reservation.findMany({
      where: {
        resourceId: { in: resourceRows.map((resource) => resource.id) },
        status: { not: ReservationStatus.CANCELLED },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      include: includeUser,
    });
    const resources = resourceRows.map(mapResource);
    const reservations = reservationRows.map(mapReservation);
    const [settingsRow, blockRows] = await Promise.all([
      prisma.bookingSettings.findUnique({ where: { id: 1 } }),
      prisma.bookingBlock.findMany({
        where: { date: { gte: new Date(`${value.date}T00:00:00.000Z`), lte: new Date(`${endDate}T00:00:00.000Z`) } },
      }),
    ]);
    const settings: BookingSettingsView = {
      restrictSaturday: settingsRow?.restrictSaturday ?? false,
      restrictSunday: settingsRow?.restrictSunday ?? false,
    };
    const bookingBlocks: BookingBlockView[] = blockRows.map((block) => ({
      id: block.id,
      date: block.date.toISOString().slice(0, 10),
      resourceId: block.resourceId,
      resourceName: null,
      reason: block.reason,
    }));
    const now = new Date();
    const startMin = timeToMinutes(value.startTime as string);
    const rawEndMin = timeToMinutes(value.endTime as string);
    const endMin = rawEndMin < startMin ? rawEndMin + 1440 : rawEndMin;

    return {
      ok: true,
      data: resources.map((resource) => {
        const reason = getBlockReason(
          resource,
          value.date as string,
          startMin,
          endMin,
          reservations,
          now,
          undefined,
          { settings, bookingBlocks },
        );
        return {
          id: resource.id,
          name: resource.name,
          type: resource.type,
          capacity: resource.capacity,
          available: reason === null,
          reason: reason ? BLOCK_REASON_LABEL[reason] : null,
        };
      }),
    };
  } catch (e) {
    return authFail(e) ?? fail("Could not check availability.", "UNKNOWN");
  }
}

function overlapWhere(resourceId: string, startAt: Date, endAt: Date, ignoreId?: string) {
  return {
    resourceId,
    status: { not: ReservationStatus.CANCELLED },
    startAt: { lt: endAt },
    endAt: { gt: startAt },
    ...(ignoreId ? { id: { not: ignoreId } } : {}),
  };
}

async function notify(
  tx: Prisma.TransactionClient,
  userId: string,
  reservationId: string,
  type: NotificationType,
  title: string,
  message: string,
) {
  await tx.notification.create({
    data: { userId, reservationId, type, title, message },
  });
}

export async function listReservationsAction(range: DateRange): Promise<ServiceResult<Reservation[]>> {
  try {
    await requireUser();
    const from = combineLocal(range.from, "00:00");
    const to = combineLocal(range.to, "23:59");
    to.setSeconds(59, 999);
    const rows = await prisma.reservation.findMany({
      where: { startAt: { lte: to }, endAt: { gte: from } },
      include: includeUser,
      orderBy: { startAt: "asc" },
    });
    return { ok: true, data: rows.map(mapReservation) };
  } catch (e) {
    return authFail(e) ?? fail("Could not load reservations.", "UNKNOWN");
  }
}

export async function listAllReservationsAction(filters?: {
  resourceId?: string;
  status?: "confirmed" | "pending" | "cancelled" | "all";
  from?: string;
  to?: string;
}): Promise<ServiceResult<Reservation[]>> {
  try {
    await requireUser();
    const where: Prisma.ReservationWhereInput = {};
    if (filters?.resourceId) where.resourceId = filters.resourceId;
    if (filters?.status && filters.status !== "all") {
      where.status =
        filters.status === "pending"
          ? ReservationStatus.PENDING
          : filters.status === "cancelled"
            ? ReservationStatus.CANCELLED
            : ReservationStatus.CONFIRMED;
    }
    if (filters?.from || filters?.to) {
      const from = filters.from ? combineLocal(filters.from, "00:00") : undefined;
      const to = filters.to ? combineLocal(filters.to, "23:59") : undefined;
      if (to) to.setSeconds(59, 999);
      where.AND = [
        from ? { endAt: { gte: from } } : {},
        to ? { startAt: { lte: to } } : {},
      ];
    }
    const rows = await prisma.reservation.findMany({
      where,
      include: includeUser,
      orderBy: { startAt: "desc" },
      take: 200,
    });
    return { ok: true, data: rows.map(mapReservation) };
  } catch (e) {
    return authFail(e) ?? fail("Could not load reservations.", "UNKNOWN");
  }
}

async function validateOnServer(input: ReservationInput, ignoreId?: string) {
  const resources = (await prisma.resource.findMany()).map(mapResource);
  const dayFrom = combineLocal(input.date, "00:00");
  const { endAt } = combineReservationTimes(input.date, input.startTime, input.endTime);
  const endDate = toISODate(endAt);
  const dayTo = combineLocal(endDate, "23:59");
  dayTo.setSeconds(59, 999);
  const [dayRows, settingsRow, blockRows] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        resourceId: input.resourceId || undefined,
        startAt: { lte: dayTo },
        endAt: { gte: dayFrom },
      },
      include: includeUser,
    }),
    prisma.bookingSettings.findUnique({ where: { id: 1 } }),
    prisma.bookingBlock.findMany({
      where: {
        date: { gte: new Date(`${input.date}T00:00:00.000Z`), lte: new Date(`${endDate}T00:00:00.000Z`) },
      },
    }),
  ]);
  const original = ignoreId
    ? await prisma.reservation.findUnique({ where: { id: ignoreId }, include: includeUser })
    : null;
  return validateReservation(input, {
    resources,
    reservations: dayRows.map(mapReservation),
    now: new Date(),
    original: original ? mapReservation(original) : undefined,
    settings: {
      restrictSaturday: settingsRow?.restrictSaturday ?? false,
      restrictSunday: settingsRow?.restrictSunday ?? false,
    },
    bookingBlocks: blockRows.map((block) => ({
      id: block.id,
      date: block.date.toISOString().slice(0, 10),
      resourceId: block.resourceId,
      resourceName: null,
      reason: block.reason,
    })),
  });
}

export async function createReservationAction(
  input: ReservationInput,
): Promise<ServiceResult<Reservation>> {
  try {
    const user = await requireUser();
    const shapeErrors = validateReservationInputShape(input);
    if (hasErrors(shapeErrors)) {
      return fail(shapeErrors.form ?? "Please fix the highlighted fields.", "VALIDATION", shapeErrors);
    }
    const errors = await validateOnServer(input);
    if (hasErrors(errors)) {
      return fail(errors.form ?? "Please fix the highlighted fields.", errors.form ? "CONFLICT" : "VALIDATION", errors);
    }

    const { startAt, endAt } = combineReservationTimes(input.date, input.startTime, input.endTime);

    const created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM resources WHERE id = ${input.resourceId}::uuid FOR UPDATE`;
      const clash = await tx.reservation.findFirst({
        where: overlapWhere(input.resourceId, startAt, endAt),
      });
      if (clash) {
        const err = new Error("CONFLICT") as Error & { code: string };
        err.code = "CONFLICT";
        throw err;
      }
      const reservation = await tx.reservation.create({
        data: {
          resourceId: input.resourceId,
          userId: user.id,
          title: input.title.trim(),
          description: input.notes.trim() || null,
          attendees: input.attendees,
          startAt,
          endAt,
          status: ReservationStatus.CONFIRMED,
        },
        include: includeUser,
      });
      await notify(
        tx,
        user.id,
        reservation.id,
        NotificationType.RESERVATION_CREATED,
        "Reservation confirmed",
        `${reservation.title} is booked for ${toISODate(reservation.startAt)}.`,
      );
      return reservation;
    });
    revalidateBookingViews();

    return { ok: true, data: mapReservation(created) };
  } catch (e) {
    const auth = authFail(e);
    if (auth) return auth;
    if (
      (e instanceof Error && (e as { code?: string }).code === "CONFLICT") ||
      (e instanceof Error && /reservations_no_overlap|23P01/.test(e.message))
    ) {
      return fail("That time overlaps another reservation for this resource.", "CONFLICT", {
        form: "That time overlaps another reservation for this resource.",
      });
    }
    console.error(
      "Reservation creation failed.",
      e instanceof Error ? `${e.name}: ${e.message}` : "Unknown error",
    );
    return fail("Could not create the reservation.", "UNKNOWN");
  }
}

export async function updateReservationAction(
  id: string,
  input: ReservationInput,
): Promise<ServiceResult<Reservation>> {
  try {
    const user = await requireUser();
    const existing = await prisma.reservation.findUnique({ where: { id }, include: includeUser });
    if (!existing) return fail("This reservation no longer exists.", "NOT_FOUND");
    if (!canManageReservation(user, existing.userId)) {
      return fail("You can only edit your own reservations.", "FORBIDDEN");
    }
    if (existing.status === ReservationStatus.CANCELLED) {
      return fail("Cancelled reservations can't be edited.");
    }
    if (isReservationEnded(mapReservation(existing), new Date())) {
      return fail("This reservation has already ended.");
    }

    const shapeErrors = validateReservationInputShape(input);
    if (hasErrors(shapeErrors)) {
      return fail(shapeErrors.form ?? "Please fix the highlighted fields.", "VALIDATION", shapeErrors);
    }
    const errors = await validateOnServer(input, id);
    if (hasErrors(errors)) {
      return fail(errors.form ?? "Please fix the highlighted fields.", errors.form ? "CONFLICT" : "VALIDATION", errors);
    }

    const { startAt, endAt } = combineReservationTimes(input.date, input.startTime, input.endTime);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM resources WHERE id = ${input.resourceId}::uuid FOR UPDATE`;
      const clash = await tx.reservation.findFirst({
        where: overlapWhere(input.resourceId, startAt, endAt, id),
      });
      if (clash) {
        const err = new Error("CONFLICT") as Error & { code: string };
        err.code = "CONFLICT";
        throw err;
      }
      const reservation = await tx.reservation.update({
        where: { id },
        data: {
          resourceId: input.resourceId,
          title: input.title.trim(),
          description: input.notes.trim() || null,
          attendees: input.attendees,
          startAt,
          endAt,
        },
        include: includeUser,
      });
      await notify(
        tx,
        existing.userId,
        reservation.id,
        NotificationType.RESERVATION_UPDATED,
        "Reservation updated",
        `${reservation.title} was updated.`,
      );
      return reservation;
    });
    revalidateBookingViews();

    return { ok: true, data: mapReservation(updated) };
  } catch (e) {
    const auth = authFail(e);
    if (auth) return auth;
    if (
      (e instanceof Error && (e as { code?: string }).code === "CONFLICT") ||
      (e instanceof Error && /reservations_no_overlap|23P01/.test(e.message))
    ) {
      return fail("That time overlaps another reservation for this resource.", "CONFLICT", {
        form: "That time overlaps another reservation for this resource.",
      });
    }
    return fail("Could not update the reservation.", "UNKNOWN");
  }
}

export async function cancelReservationAction(
  id: string,
  reason?: string,
): Promise<ServiceResult<Reservation>> {
  try {
    const user = await requireUser();
    const existing = await prisma.reservation.findUnique({ where: { id }, include: includeUser });
    if (!existing) return fail("This reservation no longer exists.", "NOT_FOUND");
    if (!canManageReservation(user, existing.userId)) {
      return fail("You can only cancel your own reservations.", "FORBIDDEN");
    }
    if (existing.status === ReservationStatus.CANCELLED) {
      return fail("This reservation is already cancelled.");
    }
    if (isReservationEnded(mapReservation(existing), new Date())) {
      return fail("This reservation has already ended.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.update({
        where: { id },
        data: {
          status: ReservationStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancellationReason: typeof reason === "string" ? reason.trim().slice(0, 300) || null : null,
        },
        include: includeUser,
      });
      await notify(
        tx,
        existing.userId,
        reservation.id,
        NotificationType.RESERVATION_CANCELLED,
        "Reservation cancelled",
        `${reservation.title} was cancelled.`,
      );
      return reservation;
    });
    revalidateBookingViews();

    return { ok: true, data: mapReservation(updated) };
  } catch (e) {
    return authFail(e) ?? fail("Could not cancel the reservation.", "UNKNOWN");
  }
}
