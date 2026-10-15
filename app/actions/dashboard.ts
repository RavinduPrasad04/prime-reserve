"use server";

import { ReservationStatus } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { mapReservation } from "@/lib/mappers";
import { prisma } from "@/lib/prisma";
import { TABLE_PAGE_SIZE, type Reservation, type ServiceResult } from "@/lib/domain";

export type DashboardStats = {
  resourceCount: number;
  activeResourceCount: number;
  reservationCount: number;
  confirmedCount: number;
  pendingCount: number;
  cancelledCount: number;
  upcoming: Reservation[];
  upcomingCount: number;
};

export async function getDashboardStatsAction(page = 1): Promise<ServiceResult<DashboardStats>> {
  try {
    await requireUser();
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const now = new Date();
    const upcomingWhere = {
      status: { not: ReservationStatus.CANCELLED },
      endAt: { gte: now },
    };
    const [resourceCount, activeResourceCount, reservationCount, confirmedCount, pendingCount, cancelledCount, upcomingCount, upcomingRows] =
      await Promise.all([
        prisma.resource.count(),
        prisma.resource.count({ where: { isActive: true } }),
        prisma.reservation.count(),
        prisma.reservation.count({ where: { status: ReservationStatus.CONFIRMED } }),
        prisma.reservation.count({ where: { status: ReservationStatus.PENDING } }),
        prisma.reservation.count({ where: { status: ReservationStatus.CANCELLED } }),
        prisma.reservation.count({ where: upcomingWhere }),
        prisma.reservation.findMany({
          where: upcomingWhere,
          include: { user: { select: { name: true } } },
          orderBy: { startAt: "asc" },
          skip: (safePage - 1) * TABLE_PAGE_SIZE,
          take: TABLE_PAGE_SIZE,
        }),
      ]);

    return {
      ok: true,
      data: {
        resourceCount,
        activeResourceCount,
        reservationCount,
        confirmedCount,
        pendingCount,
        cancelledCount,
        upcoming: upcomingRows.map(mapReservation),
        upcomingCount,
      },
    };
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return { ok: false, error: { code: "UNAUTHORIZED", message: "Please sign in." } };
    }
    return { ok: false, error: { code: "UNKNOWN", message: "Could not load dashboard." } };
  }
}
