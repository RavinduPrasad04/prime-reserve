"use server";

import { requireUser } from "@/lib/auth";
import { mapNotification } from "@/lib/mappers";
import { prisma } from "@/lib/prisma";
import type { NotificationView, ServiceResult } from "@/lib/domain";
import { revalidatePath } from "next/cache";

// Retrieves the latest 50 notifications belonging to the signed-in user.
export async function listNotificationsAction(): Promise<ServiceResult<NotificationView[]>> {
  try {
    const user = await requireUser();
    const rows = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { ok: true, data: rows.map(mapNotification) };
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return { ok: false, error: { code: "UNAUTHORIZED", message: "Please sign in." } };
    }
    return { ok: false, error: { code: "UNKNOWN", message: "Could not load notifications." } };
  }
}

// Returns the number of unread notifications for the current user.
export async function unreadCountAction(): Promise<number> {
  try {
    const user = await requireUser();
    return prisma.notification.count({ where: { userId: user.id, isRead: false } });
  } catch {
    return 0;
  }
}

// Marks a user's notification as read after verifying ownership.
export async function markNotificationReadAction(id: string): Promise<ServiceResult<NotificationView>> {
  try {
    const user = await requireUser();
    const row = await prisma.notification.findFirst({ where: { id, userId: user.id } });
    if (!row) return { ok: false, error: { code: "NOT_FOUND", message: "Notification not found." } };
    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
    revalidatePath("/notifications");
    return { ok: true, data: mapNotification(updated) };
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return { ok: false, error: { code: "UNAUTHORIZED", message: "Please sign in." } };
    }
    return { ok: false, error: { code: "UNKNOWN", message: "Could not update notification." } };
  }
}

// Marks all unread notifications belonging to the signed-in user as read.
export async function markAllNotificationsReadAction(): Promise<ServiceResult<{ count: number }>> {
  try {
    const user = await requireUser();
    const result = await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    revalidatePath("/notifications");
    return { ok: true, data: { count: result.count } };
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return { ok: false, error: { code: "UNAUTHORIZED", message: "Please sign in." } };
    }
    return { ok: false, error: { code: "UNKNOWN", message: "Could not update notifications." } };
  }
}
