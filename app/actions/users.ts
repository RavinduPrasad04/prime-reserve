"use server";

import { Prisma } from "@/generated/prisma/client";
import { UserRole } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { mapUser } from "@/lib/mappers";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import type { ServiceResult, UserView } from "@/lib/domain";

type UserUpdateInput = {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "MEMBER";
  isActive: boolean;
  department: string;
  jobTitle: string;
};

// Creates a consistent error response for user management actions.
function fail(
  message: string,
  code: "VALIDATION" | "NOT_FOUND" | "UNKNOWN" | "UNAUTHORIZED" | "FORBIDDEN" = "VALIDATION",
): ServiceResult<never> {
  return { ok: false, error: { code, message } };
}

// Validates the structure and data types of user update input.
function isUserUpdateInput(input: unknown): input is UserUpdateInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return (
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    typeof value.password === "string" &&
    (value.role === "ADMIN" || value.role === "MEMBER") &&
    typeof value.isActive === "boolean" &&
    typeof value.department === "string" &&
    typeof value.jobTitle === "string"
  );
}

// Validates and normalizes user details before updating an account.
function validateUserUpdate(
  input: UserUpdateInput,
): { ok: false; error: string } | { ok: true; name: string; email: string } {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (name.length < 2) return { ok: false, error: "Enter a name." };
  if (name.length > 100) return { ok: false, error: "Name must be 100 characters or fewer." };
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email." };
  }
  if (input.password.length > 0 && input.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (input.department.trim().length > 100) {
    return { ok: false, error: "Department must be 100 characters or fewer." };
  }
  if (input.jobTitle.trim().length > 100) {
    return { ok: false, error: "Job title must be 100 characters or fewer." };
  }

  return { ok: true, name, email };
}

// Checks whether the supplied user ID is a valid UUID.
function isUserId(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);
}

// Converts authentication and authorization errors into service responses.
function authFail(e: unknown): ServiceResult<never> | null {
  if (e instanceof Error && e.message === "UNAUTHORIZED") return fail("Please sign in.", "UNAUTHORIZED");
  if (e instanceof Error && e.message === "FORBIDDEN") return fail("Only admins can manage users.", "FORBIDDEN");
  return null;
}

// Retrieves all user accounts for administrators.
export async function listUsersAction(): Promise<ServiceResult<UserView[]>> {
  try {
    await requireAdmin();
    const rows = await prisma.user.findMany({ orderBy: { name: "asc" } });
    return { ok: true, data: rows.map(mapUser) };
  } catch (e) {
    return authFail(e) ?? fail("Could not load users.", "UNKNOWN");
  }
}
// Validates and creates a user account with an optional department and job title
export async function createUserAction(input: {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "MEMBER";
  department?: string;
  jobTitle?: string;
}): Promise<ServiceResult<UserView>> {
  try {
    await requireAdmin();

    if (
      typeof input.name !== "string" ||
      typeof input.email !== "string" ||
      typeof input.password !== "string" ||
      (input.role !== "ADMIN" && input.role !== "MEMBER") ||
      (input.department !== undefined && typeof input.department !== "string") ||
      (input.jobTitle !== undefined && typeof input.jobTitle !== "string")
    ) {
      return fail("Enter valid account details.");
    }

    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const department = input.department?.trim() ?? "";
    const jobTitle = input.jobTitle?.trim() ?? "";

    if (name.length < 2) return fail("Enter a name.");
    if (name.length > 100) return fail("Name must be 100 characters or fewer.");
    if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail("Enter a valid email.");
    }
    if (input.password.length < 8) return fail("Password must be at least 8 characters.");
    if (department.length > 100) return fail("Department must be 100 characters or fewer.");
    if (jobTitle.length > 100) return fail("Job title must be 100 characters or fewer.");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return fail("That email is already in use.");

    const row = await prisma.user.create({
      data: {
        name,
        email,
        department: department || null,
        jobTitle: jobTitle || null,
        passwordHash: hashPassword(input.password),
        role: input.role === "ADMIN" ? UserRole.ADMIN : UserRole.MEMBER,
      },
    });

    return { ok: true, data: mapUser(row) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("That email is already in use.");
    }
    return authFail(e) ?? fail("Could not create the user.", "UNKNOWN");
  }
}

// Validates and updates an existing user's account details.
export async function updateUserAction(id: string, input: unknown): Promise<ServiceResult<UserView>> {
  try {
    const actor = await requireAdmin();
    if (!isUserId(id)) return fail("This user no longer exists.", "NOT_FOUND");
    if (!isUserUpdateInput(input)) return fail("Enter valid account details.");
    if (actor.id === id && !input.isActive) return fail("You can't deactivate your own account.");

    const parsed = validateUserUpdate(input);
    if (!parsed.ok) return fail(parsed.error);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return fail("This user no longer exists.", "NOT_FOUND");

    const emailOwner = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (emailOwner && emailOwner.id !== id) return fail("That email is already in use.");

    const data = {
      name: parsed.name,
      email: parsed.email,
      role: input.role === "ADMIN" ? UserRole.ADMIN : UserRole.MEMBER,
      isActive: input.isActive,
      department: input.department.trim() || null,
      jobTitle: input.jobTitle.trim() || null,
    };

    const row = await prisma.user.update({
      where: { id },
      data: input.password ? { ...data, passwordHash: hashPassword(input.password) } : data,
    });

    return { ok: true, data: mapUser(row) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("That email is already in use.");
    }
    return authFail(e) ?? fail("Could not update the user.", "UNKNOWN");
  }
}

// Activates or deactivates a user account.
export async function setUserActiveAction(id: string, isActive: boolean): Promise<ServiceResult<UserView>> {
  try {
    const actor = await requireAdmin();
    if (actor.id === id && !isActive) return fail("You can't deactivate your own account.");
    const row = await prisma.user.update({ where: { id }, data: { isActive } });
    return { ok: true, data: mapUser(row) };
  } catch (e) {
    return authFail(e) ?? fail("Could not update the user.", "UNKNOWN");
  }
}