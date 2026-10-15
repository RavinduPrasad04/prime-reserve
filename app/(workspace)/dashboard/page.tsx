"use client";

import { currentUserAction } from "@/app/actions/auth";
import { getDashboardStatsAction } from "@/app/actions/dashboard";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, ErrorBanner, Skeleton } from "@/components/ui/EmptyState";
import { PageHeader, PageShell } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/Badge";
import { TablePagination } from "@/components/ui/TablePagination";
import type { DashboardStats } from "@/app/actions/dashboard";
import type { SessionUserView } from "@/lib/domain";
import { reservationEndDate } from "@/lib/dates";
import { BadgeCheck, Boxes, CalendarDays, Clock3, CircleX } from "lucide-react";
import { startTransition, useCallback, useEffect, useState } from "react";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [user, setUser] = useState<SessionUserView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => new Date());
  // UI-only: which status is highlighted across cards and the mix bar
  const [focus, setFocus] = useState<StatusKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [result, currentUser] = await Promise.all([getDashboardStatsAction(page), currentUserAction()]);
    setUser(currentUser);
    if (result.ok) {
      setStats(result.data);
      setError(null);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const timestamp = new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        actions={<ButtonLink href="/calendar">Open calendar</ButtonLink>}
      />

      {/* Greeting panel */}
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-zinc-900 px-6 py-6 text-white sm:px-8 sm:py-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-sky-500/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 right-40 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting}
              {user ? `, ${user.name}` : ""}
            </h2>
            <p className="mt-2 flex items-center gap-2 text-sm text-zinc-300">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              {timestamp}
            </p>
          </div>
          {stats ? (
            <p className="text-sm text-zinc-400">
              <span className="text-2xl font-semibold tabular-nums text-white">{stats.upcomingCount}</span>{" "}
              upcoming {stats.upcomingCount === 1 ? "reservation" : "reservations"}
            </p>
          ) : null}
        </div>
      </div>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {loading && !stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Active resources"
              value={stats.activeResourceCount}
              hint={`${stats.resourceCount} total`}
              Icon={Boxes}
              tone={TONES.resources}
              share={stats.resourceCount > 0 ? stats.activeResourceCount / stats.resourceCount : 0}
            />
            <StatCard
              label="Confirmed reservations"
              value={stats.confirmedCount}
              hint="Confirmed bookings"
              Icon={BadgeCheck}
              tone={TONES.confirmed}
              share={shareOf(stats.confirmedCount, stats)}
              active={focus === "confirmed"}
              dimmed={focus !== null && focus !== "confirmed"}
              onFocus={() => setFocus("confirmed")}
              onBlur={() => setFocus(null)}
            />
            <StatCard
              label="Pending reservations"
              value={stats.pendingCount}
              hint="Awaiting confirmation"
              Icon={Clock3}
              tone={TONES.pending}
              share={shareOf(stats.pendingCount, stats)}
              active={focus === "pending"}
              dimmed={focus !== null && focus !== "pending"}
              onFocus={() => setFocus("pending")}
              onBlur={() => setFocus(null)}
            />
            <StatCard
              label="Cancelled reservations"
              value={stats.cancelledCount}
              hint="Kept for history"
              Icon={CircleX}
              tone={TONES.cancelled}
              share={shareOf(stats.cancelledCount, stats)}
              active={focus === "cancelled"}
              dimmed={focus !== null && focus !== "cancelled"}
              onFocus={() => setFocus("cancelled")}
              onBlur={() => setFocus(null)}
            />
          </div>

          <section className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-zinc-900">Upcoming reservations</h2>
              <ButtonLink href="/reservations" variant="ghost">
                View all
              </ButtonLink>
            </div>
            {stats.upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No upcoming reservations"
                description="Create a booking from the calendar or reservations page."
                action={<ButtonLink href="/reservations?new=1">New reservation</ButtonLink>}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-150 text-left text-sm">
                  <thead className="bg-zinc-50/80 text-xs text-zinc-500">
                    <tr>
                      <th className="px-5 py-2.5 font-medium">Reservation</th>
                      <th className="px-5 py-2.5 font-medium">Date and time</th>
                      <th className="px-5 py-2.5 font-medium">Booked by</th>
                      <th className="px-5 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {stats.upcoming.map((item) => {
                      const endDate = reservationEndDate(item.date, item.startTime, item.endTime);
                      return (
                        <tr
                          key={item.id}
                          className="group transition-colors hover:bg-sky-50/60 focus-within:bg-sky-50/60"
                        >
                          <td className="relative px-5 py-3.5 font-medium text-zinc-900">
                            <span
                              aria-hidden="true"
                              className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sky-500 opacity-0 transition-opacity group-hover:opacity-100"
                            />
                            {item.title}
                          </td>
                          <td className="px-5 py-3.5 text-zinc-600">
                            <span className="inline-flex items-center gap-2">
                              <CalendarDays
                                className="h-3.5 w-3.5 text-zinc-400 transition-colors group-hover:text-sky-600"
                                aria-hidden="true"
                              />
                              <span>
                                {item.date} · {item.startTime}–{item.endTime}
                                {endDate !== item.date ? ` (+${endDate})` : ""}
                              </span>
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-zinc-600">
                            <span className="inline-flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className="grid h-6 w-6 place-items-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600 transition-colors group-hover:bg-sky-100 group-hover:text-sky-700"
                              >
                                {initials(item.bookedBy)}
                              </span>
                              {item.bookedBy}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusBadge status={item.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <TablePagination
              page={page}
              totalItems={stats.upcomingCount}
              label="upcoming reservations"
              onPageChange={setPage}
            />
          </section>
        </>
      ) : null}
    </PageShell>
  );
}

/* ---------- presentation helpers (no data logic) ---------- */

type StatusKey = "confirmed" | "pending" | "cancelled";

type Tone = {
  text: string;
  surface: string;
  bar: string;
  ring: string;
};

const TONES: Record<StatusKey | "resources", Tone> = {
  resources: { text: "text-sky-700", surface: "bg-sky-50", bar: "bg-sky-500", ring: "ring-sky-300" },
  confirmed: { text: "text-emerald-700", surface: "bg-emerald-50", bar: "bg-emerald-500", ring: "ring-emerald-300" },
  pending: { text: "text-amber-700", surface: "bg-amber-50", bar: "bg-amber-500", ring: "ring-amber-300" },
  cancelled: { text: "text-rose-700", surface: "bg-rose-50", bar: "bg-rose-500", ring: "ring-rose-300" },
};

function shareOf(value: number, stats: DashboardStats) {
  const total = stats.confirmedCount + stats.pendingCount + stats.cancelledCount;
  return total > 0 ? value / total : 0;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

/** Eases a number up from 0 on mount/change; snaps instantly if the user prefers reduced motion. */
function useCountUp(target: number, duration = 700) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return display;
}

function StatCard({
  label,
  value,
  hint,
  Icon,
  tone,
  share,
  active = false,
  dimmed = false,
  onFocus,
  onBlur,
}: {
  label: string;
  value: number;
  hint: string;
  Icon: typeof Boxes;
  tone: Tone;
  share: number;
  active?: boolean;
  dimmed?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const shown = useCountUp(value);
  const interactive = Boolean(onFocus);
  return (
    <div
      tabIndex={interactive ? 0 : undefined}
      onMouseEnter={onFocus}
      onMouseLeave={onBlur}
      onFocus={onFocus}
      onBlur={onBlur}
      className={[
        "group rounded-2xl border bg-white px-5 py-4 shadow-sm outline-none transition duration-200",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 motion-reduce:transform-none",
        active ? `border-transparent ring-2 ${tone.ring}` : "border-zinc-200",
        tone.ring.replace("ring-", "focus-visible:ring-"),
        dimmed ? "opacity-60" : "opacity-100",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone.surface} ${tone.text} transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-medium ${tone.text}`}>{label}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900">{shown}</p>
        </div>
      </div>
      <div className="mt-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full rounded-full ${tone.bar} transition-[width] duration-700 ease-out`}
            style={{ width: `${Math.round(share * 100)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
          <span>{hint}</span>
          <span className="tabular-nums">{Math.round(share * 100)}%</span>
        </div>
      </div>
    </div>
  );
}