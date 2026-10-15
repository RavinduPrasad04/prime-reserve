"use server";

import { NotificationType, Prisma, UserRole } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { validateRegistrationInput } from "@/lib/registration";
import { clearSession, setSession } from "@/lib/session";
import { getCurrentUser, requireUser } from "@/lib/auth";
import type { ServiceResult, SessionUserView } from "@/lib/domain";

// Authenticate an active user and create their session.

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false as const, error: "Enter your email and password." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    return { ok: false as const, error: "Those credentials don't match an active account." };
  }

  await setSession(user.id);
  redirect("/dashboard");
}

// Register a member account and notify active administrators.
export async function registerAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = validateRegistrationInput({
    name: formData.get("name"),
    email: formData.get("email"),
    department: formData.get("department"),
    jobTitle: formData.get("jobTitle"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    // Check for an existing email before creating the account.
    const existing = await prisma.user.findFirst({
      where: { email: { equals: parsed.data.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) return { ok: false, error: "That email is already registered." };

    // Registration requires at least one active administrator to receive the notification.
    const admins = await prisma.user.findMany({
      where: { role: UserRole.ADMIN, isActive: true },
      select: { id: true },
    });
    if (admins.length === 0) {
      return { ok: false, error: "Registration is temporarily unavailable. Please contact an administrator." };
    }

    // Create the member and notify administrators in the same transaction.
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          department: parsed.data.department || null,
          jobTitle: parsed.data.jobTitle || null,
          passwordHash: hashPassword(parsed.data.password),
          role: UserRole.MEMBER,
        },
        select: { name: true, email: true },
      });

      await tx.notification.createMany({
        data: admins.map(({ id }) => ({
          userId: id,
          type: NotificationType.RESERVATION_CREATED,
          title: "New member registered",
          message: `${user.name} (${user.email}) created a member account.`,
        })),
      });
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "That email is already registered." };
    }
    console.error("Member registration failed.", error);
    return { ok: false, error: "Could not complete registration. Please try again." };
  }
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function currentUserAction(): Promise<SessionUserView | null> {
  return getCurrentUser();
}

// Update the current user's profile and optionally change their password.
export async function updateProfileAction(input: unknown): Promise<ServiceResult<SessionUserView>> {
  try {
    const actor = await requireUser();
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { ok: false, error: { code: "VALIDATION", message: "Enter valid profile details." } };
    }

    const value = input as Record<string, unknown>;
    if (
      typeof value.name !== "string" ||
      typeof value.email !== "string" ||
      typeof value.currentPassword !== "string" ||
      typeof value.newPassword !== "string" ||
      typeof value.confirmNewPassword !== "string" ||
      typeof value.department !== "string" ||
      typeof value.jobTitle !== "string"
    ) {
      return { ok: false, error: { code: "VALIDATION", message: "Enter valid profile details." } };
    }

    const name = value.name.trim();
    const email = value.email.trim().toLowerCase();
    const department = value.department.trim();
    const jobTitle = value.jobTitle.trim();
    if (name.length < 2) {
      return { ok: false, error: { code: "VALIDATION", message: "Name must be at least 2 characters." } };
    }
    if (name.length > 100) {
      return { ok: false, error: { code: "VALIDATION", message: "Name must be 100 characters or fewer." } };
    }
    if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: { code: "VALIDATION", message: "Enter a valid email." } };
    }
    const changingPassword =
      value.currentPassword.length > 0 || value.newPassword.length > 0 || value.confirmNewPassword.length > 0;
    if (changingPassword && !value.currentPassword) {
      return { ok: false, error: { code: "VALIDATION", message: "Enter your current password to change it." } };
    }
    if (changingPassword && !value.newPassword) {
      return { ok: false, error: { code: "VALIDATION", message: "Enter a new password." } };
    }
    if (changingPassword && !value.confirmNewPassword) {
      return { ok: false, error: { code: "VALIDATION", message: "Confirm your new password." } };
    }
    if (changingPassword && value.newPassword.length < 8) {
      return { ok: false, error: { code: "VALIDATION", message: "New password must be at least 8 characters." } };
    }
    if (changingPassword && value.newPassword !== value.confirmNewPassword) {
      return { ok: false, error: { code: "VALIDATION", message: "New password and confirmation do not match." } };
    }
    if (department.length > 100) {
      return { ok: false, error: { code: "VALIDATION", message: "Department must be 100 characters or fewer." } };
    }
    if (jobTitle.length > 100) {
      return { ok: false, error: { code: "VALIDATION", message: "Job title must be 100 characters or fewer." } };
    }

    const emailOwner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (emailOwner && emailOwner.id !== actor.id) {
      return { ok: false, error: { code: "VALIDATION", message: "That email is already in use." } };
    }

    if (changingPassword) {
      const account = await prisma.user.findUnique({
        where: { id: actor.id },
        select: { passwordHash: true },
      });
      if (!account || !verifyPassword(value.currentPassword, account.passwordHash)) {
        return { ok: false, error: { code: "VALIDATION", message: "Current password is incorrect." } };
      }
    }

    const row = await prisma.user.update({
      where: { id: actor.id },
      data: changingPassword
        ? { name, email, department: department || null, jobTitle: jobTitle || null, passwordHash: hashPassword(value.newPassword) }
        : { name, email, department: department || null, jobTitle: jobTitle || null },
      select: { id: true, name: true, email: true, role: true, department: true, jobTitle: true },
    });
    return { ok: true, data: row };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: { code: "VALIDATION", message: "That email is already in use." } };
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return { ok: false, error: { code: "UNAUTHORIZED", message: "Please sign in." } };
    }
    return { ok: false, error: { code: "UNKNOWN", message: "Could not update your profile." } };
  }
}
