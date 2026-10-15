"use server";

import { requireAdmin, requireUser } from "@/lib/auth";
import { isValidISODate } from "@/lib/dates";
import type { DateRange } from "@/lib/dates";
import type { BookingBlockView, BookingSettingsView, ServiceResult } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

type BookingRestrictions = {
  settings: BookingSettingsView;
  blocks: BookingBlockView[];
};

// Creates a consistent error response for booking-related actions.
function fail(
  message: string,
  code: "VALIDATION" | "NOT_FOUND" | "UNKNOWN" | "UNAUTHORIZED" | "FORBIDDEN" = "VALIDATION",
): ServiceResult<never> {
  return { ok: false, error: { code, message } };
}

// Converts authentication and authorization errors into service responses.
function authFail(error: unknown): ServiceResult<never> | null {
  if (error instanceof Error && error.message === "UNAUTHORIZED") return fail("Please sign in.", "UNAUTHORIZED");
  if (error instanceof Error && error.message === "FORBIDDEN") return fail("Only admins can manage booking settings.", "FORBIDDEN");
  return null;
}

function dateValue(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function mapBlock(row: {
  id: string;
  date: Date;
  resourceId: string | null;
  reason: string | null;
  resource?: { name: string } | null;
}): BookingBlockView {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    resourceId: row.resourceId,
    resourceName: row.resource?.name ?? null,
    reason: row.reason,
  };
}

// Loads weekend restrictions, using unrestricted defaults when settings are not stored.
async function getSettings(): Promise<BookingSettingsView> {
  const settings = await prisma.bookingSettings.findUnique({ where: { id: 1 } });
  return {
    restrictSaturday: settings?.restrictSaturday ?? false,
    restrictSunday: settings?.restrictSunday ?? false,
  };
}

// Returns booking settings and blocks within a validated date range for signed-in users.
export async function listBookingRestrictionsAction(
  range: DateRange,
): Promise<ServiceResult<BookingRestrictions>> {
  try {
    await requireUser();
    if (
      typeof range !== "object" ||
      range === null ||
      typeof range.from !== "string" ||
      typeof range.to !== "string" ||
      !isValidISODate(range.from) ||
      !isValidISODate(range.to) ||
      range.from > range.to
    ) {
      return fail("Choose a valid date range.");
    }
    const [settings, rows] = await Promise.all([
      getSettings(),
      prisma.bookingBlock.findMany({
        where: { date: { gte: dateValue(range.from), lte: dateValue(range.to) } },
        include: { resource: { select: { name: true } } },
        orderBy: [{ date: "asc" }, { resourceId: "asc" }],
      }),
    ]);
    return { ok: true, data: { settings, blocks: rows.map(mapBlock) } };
  } catch (error) {
    return authFail(error) ?? fail("Could not load booking restrictions.", "UNKNOWN");
  }
}

// Lists all booking blocks for administrators.
export async function listBookingBlocksAction(): Promise<ServiceResult<BookingBlockView[]>> {
  try {
    await requireAdmin();
    const rows = await prisma.bookingBlock.findMany({
      include: { resource: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { resourceId: "asc" }],
    });
    return { ok: true, data: rows.map(mapBlock) };
  } catch (error) {
    return authFail(error) ?? fail("Could not load booking blocks.", "UNKNOWN");
  }
}

// Retrieves the current weekend booking restrictions for administrators.
export async function getBookingSettingsAction(): Promise<ServiceResult<BookingSettingsView>> {
  try {
    await requireAdmin();
    return { ok: true, data: await getSettings() };
  } catch (error) {
    if (!(error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message))) {
      console.error(
        "Loading booking settings failed.",
        error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error",
      );
    }
    return authFail(error) ?? fail("Could not load booking settings.", "UNKNOWN");
  }
}

// Validates and saves weekend restrictions, then refreshes affected pages.
export async function updateBookingSettingsAction(input: unknown): Promise<ServiceResult<BookingSettingsView>> {
  try {
    await requireAdmin();
    if (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input) ||
      typeof (input as Record<string, unknown>).restrictSaturday !== "boolean" ||
      typeof (input as Record<string, unknown>).restrictSunday !== "boolean"
    ) {
      return fail("Choose valid weekend booking restrictions.");
    }
    const settings: BookingSettingsView = {
      restrictSaturday: (input as Record<string, unknown>).restrictSaturday as boolean,
      restrictSunday: (input as Record<string, unknown>).restrictSunday as boolean,
    };
    const row = await prisma.bookingSettings.upsert({
      where: { id: 1 },
      update: settings,
      create: { id: 1, ...settings },
    });
    revalidatePath("/calendar");
    revalidatePath("/booking-settings");
    return {
      ok: true,
      data: { restrictSaturday: row.restrictSaturday, restrictSunday: row.restrictSunday },
    };
  } catch (error) {
    return authFail(error) ?? fail("Could not update booking settings.", "UNKNOWN");
  }
}

// Creates a resource-specific or system-wide block for a selected date.
export async function createBookingBlockAction(input: unknown): Promise<ServiceResult<BookingBlockView>> {
  try {
    await requireAdmin();
    if (typeof input !== "object" || input === null || Array.isArray(input)) return fail("Enter valid booking block details.");
    const value = input as Record<string, unknown>;
    if (
      typeof value.date !== "string" ||
      !isValidISODate(value.date) ||
      (value.resourceId !== null && typeof value.resourceId !== "string") ||
      (typeof value.resourceId === "string" && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.resourceId)) ||
      (value.reason !== undefined && typeof value.reason !== "string")
    ) {
      return fail("Enter valid booking block details.");
    }
    const reason = typeof value.reason === "string" ? value.reason.trim() : "";
    if (reason.length > 300) return fail("Reason must be 300 characters or fewer.");
    const resourceId = value.resourceId as string | null;
    const date = dateValue(value.date);
    if (resourceId && !(await prisma.resource.findUnique({ where: { id: resourceId }, select: { id: true } }))) {
      return fail("Choose an existing resource.");
    }
    const existing = await prisma.bookingBlock.findFirst({ where: { date, resourceId } });
    if (existing) return fail("A booking block already exists for this date and scope.");
    const row = await prisma.bookingBlock.create({
      data: { date, resourceId, reason: reason || null },
      include: { resource: { select: { name: true } } },
    });
    revalidatePath("/calendar");
    revalidatePath("/booking-settings");
    return { ok: true, data: mapBlock(row) };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return fail("A booking block already exists for this date and scope.");
    }
    return authFail(error) ?? fail("Could not create the booking block.", "UNKNOWN");
  }
}

// Removes an existing booking block after validating its ID and admin access.
export async function deleteBookingBlockAction(id: string): Promise<ServiceResult<{ id: string }>> {
  try {
    await requireAdmin();
    if (typeof id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
      return fail("Choose a valid booking block.", "NOT_FOUND");
    }
    const existing = await prisma.bookingBlock.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return fail("This booking block no longer exists.", "NOT_FOUND");
    await prisma.bookingBlock.delete({ where: { id } });
    revalidatePath("/calendar");
    revalidatePath("/booking-settings");
    return { ok: true, data: { id } };
  } catch (error) {
    return authFail(error) ?? fail("Could not remove the booking block.", "UNKNOWN");
  }
}
