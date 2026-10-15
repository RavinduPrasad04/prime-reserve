"use server";

import { Prisma } from "@/generated/prisma/client";
import { requireAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { COLOR_PRESETS, tokenToHex, type Resource, type ResourceColor, type ResourceType } from "@/lib/domain";
import { mapResource } from "@/lib/mappers";
import type { ServiceResult } from "@/lib/domain";

// Creates a consistent error response for resource actions.
function fail(
  message: string,
  code: "VALIDATION" | "NOT_FOUND" | "UNKNOWN" | "UNAUTHORIZED" | "FORBIDDEN" = "VALIDATION",
): ServiceResult<never> {
  return { ok: false, error: { code, message } };
}

// Converts authentication and authorization errors into service responses.
function authFail(e: unknown): ServiceResult<never> | null {
  if (e instanceof Error && e.message === "UNAUTHORIZED") return fail("Please sign in.", "UNAUTHORIZED");
  if (e instanceof Error && e.message === "FORBIDDEN") return fail("Only admins can manage resources.", "FORBIDDEN");
  return null;
}

// Refreshes pages affected by resource changes.
function revalidateResourceViews() {
  revalidatePath("/resources");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}

// Defines the resource types supported by the system.
const TYPES: ResourceType[] = ["ROOM", "STUDIO", "EQUIPMENT", "VEHICLE"];

// Checks whether the supplied resource input has the expected data types.
function isResourceInput(input: unknown): input is {
  name: string;
  type: ResourceType;
  description: string;
  location: string;
  capacity: number;
  color: string;
  isActive: boolean;
} {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return (
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    TYPES.includes(value.type as ResourceType) &&
    typeof value.description === "string" &&
    typeof value.location === "string" &&
    typeof value.capacity === "number" &&
    typeof value.color === "string" &&
    typeof value.isActive === "boolean"
  );
}

// Validates resource fields and returns normalized values and validation errors.
function parseResourceInput(input: {
  name: string;
  type: string;
  description: string;
  location: string;
  capacity: number;
  color: string;
  isActive: boolean;
}) {
  const errors: string[] = [];
  const name = input.name.trim();
  if (name.length < 2) errors.push("Name must be at least 2 characters.");
  if (name.length > 100) errors.push("Name must be 100 characters or fewer.");
  if (!TYPES.includes(input.type as ResourceType)) errors.push("Choose a valid resource type.");
  const location = input.location.trim();
  if (!location) errors.push("Enter a location.");
  if (location.length > 150) errors.push("Location must be 150 characters or fewer.");
  const description = input.description.trim();
  if (description.length > 500) errors.push("Description must be 500 characters or fewer.");
  if (!Number.isInteger(input.capacity) || input.capacity < 1) errors.push("Capacity must be at least 1.");
  const colorOk =
    COLOR_PRESETS.some((c) => c.hex === input.color) ||
    COLOR_PRESETS.some((c) => c.token === input.color);
  if (!colorOk) errors.push("Choose a colour.");
  return { errors, name, location, description };
}

// Retrieves all resources for signed-in users.
export async function listResourcesAction(): Promise<ServiceResult<Resource[]>> {
  try {
    await requireUser();
    const rows = await prisma.resource.findMany({ orderBy: { name: "asc" } });
    return { ok: true, data: rows.map(mapResource) };
  } catch (e) {
    return authFail(e) ?? fail("Could not load resources.", "UNKNOWN");
  }
}

// Validates and creates a resource, then refreshes affected pages.
export async function createResourceAction(input: {
  name: string;
  type: ResourceType;
  description: string;
  location: string;
  capacity: number;
  color: ResourceColor | string;
  isActive: boolean;
}): Promise<ServiceResult<Resource>> {
  try {
    await requireAdmin();
    if (!isResourceInput(input)) return fail("Enter valid resource details.");
    const parsed = parseResourceInput(input);
    if (parsed.errors.length) return fail(parsed.errors[0]);
    const hex = input.color.startsWith("#") ? input.color : tokenToHex(input.color as ResourceColor);
    const row = await prisma.resource.create({
      data: {
        name: parsed.name,
        type: input.type,
        description: parsed.description || null,
        location: parsed.location,
        capacity: input.capacity,
        color: hex,
        isActive: input.isActive,
      },
    });
    revalidateResourceViews();
    return { ok: true, data: mapResource(row) };
  } catch (e) {
    return authFail(e) ?? fail("Could not create the resource.", "UNKNOWN");
  }
}

// Validates and updates an existing resource, then refreshes affected pages.
export async function updateResourceAction(
  id: string,
  input: {
    name: string;
    type: ResourceType;
    description: string;
    location: string;
    capacity: number;
    color: ResourceColor | string;
    isActive: boolean;
  },
): Promise<ServiceResult<Resource>> {
  try {
    await requireAdmin();
    if (!isResourceInput(input)) return fail("Enter valid resource details.");
    const existing = await prisma.resource.findUnique({ where: { id } });
    if (!existing) return fail("This resource no longer exists.", "NOT_FOUND");
    const parsed = parseResourceInput(input);
    if (parsed.errors.length) return fail(parsed.errors[0]);
    const hex = input.color.startsWith("#") ? input.color : tokenToHex(input.color as ResourceColor);
    const row = await prisma.resource.update({
      where: { id },
      data: {
        name: parsed.name,
        type: input.type,
        description: parsed.description || null,
        location: parsed.location,
        capacity: input.capacity,
        color: hex,
        isActive: input.isActive,
      },
    });
    revalidateResourceViews();
    return { ok: true, data: mapResource(row) };
  } catch (e) {
    return authFail(e) ?? fail("Could not update the resource.", "UNKNOWN");
  }
}

// Deletes a resource when unused; otherwise, deactivates it to preserve reservation history.
export async function deleteResourceAction(id: string): Promise<ServiceResult<{ deactivated: boolean }>> {
  try {
    await requireAdmin();
    const existing = await prisma.resource.findUnique({
      where: { id },
      include: { _count: { select: { reservations: true } } },
    });
    if (!existing) return fail("This resource no longer exists.", "NOT_FOUND");

    if (existing._count.reservations > 0) {
      await prisma.resource.update({ where: { id }, data: { isActive: false } });
      revalidateResourceViews();
      return { ok: true, data: { deactivated: true } };
    }

    await prisma.resource.delete({ where: { id } });
    revalidateResourceViews();
    return { ok: true, data: { deactivated: false } };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return fail("This resource could not be removed because it is still referenced.");
    }
    return authFail(e) ?? fail("Could not delete the resource.", "UNKNOWN");
  }
}
