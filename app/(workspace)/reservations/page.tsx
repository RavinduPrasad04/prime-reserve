"use client";

import { currentUserAction } from "@/app/actions/auth";
import {
  cancelReservationAction,
  createReservationAction,
  listAllReservationsAction,
  updateReservationAction,
} from "@/app/actions/reservations";
import { listResourcesAction } from "@/app/actions/resources";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TABLE_PAGE_SIZE, TablePagination } from "@/components/ui/TablePagination";
import { EmptyState, ErrorBanner, Skeleton } from "@/components/ui/EmptyState";
import { Field, controlClass } from "@/components/ui/Field";
import { PageHeader, PageShell } from "@/components/ui/PageHeader";
import { canManageReservation } from "@/lib/domain";
import { isValidISODate, reservationEndDate, toISODate } from "@/lib/dates";
import type { Reservation, ReservationInput, Resource, SessionUserView } from "@/lib/domain";
import { TIME_OPTIONS } from "@/lib/time-options";
import { BadgeCheck, Boxes, CalendarDays, CalendarRange } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, startTransition, useCallback, useEffect, useMemo, useState } from "react";

type Filters = {
  resourceId: string;
  status: "all" | "confirmed" | "pending" | "cancelled";
  from: string;
  to: string;
};

const emptyInput = (resourceId = ""): ReservationInput => ({
  resourceId,
  title: "",
  date: toISODate(new Date()),
  startTime: "09:00",
  endTime: "10:00",
  attendees: 1,
  notes: "",
});

function reservationInputFromSearchParams(params: { get(name: string): string | null }): ReservationInput {
  const values = emptyInput(params.get("resourceId") ?? "");
  const date = params.get("date");
  const startTime = params.get("startTime");
  const endTime = params.get("endTime");

  return {
    ...values,
    date: date && isValidISODate(date) ? date : values.date,
    startTime: startTime && TIME_OPTIONS.includes(startTime) ? startTime : values.startTime,
    endTime: endTime && TIME_OPTIONS.includes(endTime) ? endTime : values.endTime,
  };
}

// Presentation only: initials for the "Booked by" avatar
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

function ReservationsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<SessionUserView | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ resourceId: "", status: "all", from: "", to: "" });
  const [modal, setModal] = useState<{ mode: "create" | "edit"; original?: Reservation; values: ReservationInput } | null>(
    searchParams.get("new") === "1"
      ? { mode: "create", values: reservationInputFromSearchParams(searchParams) }
      : null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);

  const resourceName = useMemo(() => Object.fromEntries(resources.map((r) => [r.id, r.name])), [resources]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(items.length / TABLE_PAGE_SIZE)));
  const visibleItems = items.slice((currentPage - 1) * TABLE_PAGE_SIZE, currentPage * TABLE_PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    const [userResult, resourceResult, reservationResult] = await Promise.all([
      currentUserAction(),
      listResourcesAction(),
      listAllReservationsAction({
        resourceId: filters.resourceId || undefined,
        status: filters.status,
        from: filters.from || undefined,
        to: filters.to || undefined,
      }),
    ]);
    setUser(userResult);
    if (resourceResult.ok) setResources(resourceResult.data);
    if (reservationResult.ok) {
      setItems(reservationResult.data);
      setError(null);
    } else {
      setError(reservationResult.error.message);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      startTransition(() => {
        setFormError(null);
        setModal({ mode: "create", values: reservationInputFromSearchParams(searchParams) });
      });
    }
  }, [searchParams]);

  function closeModal() {
    setModal(null);
    if (searchParams.get("new") === "1") router.replace("/reservations", { scroll: false });
  }

  function updateFilters(update: (current: Filters) => Filters) {
    setPage(1);
    setFilters(update);
  }

  async function save() {
    if (!modal) return;
    setSaving(true);
    setFormError(null);
    const result =
      modal.mode === "edit" && modal.original
        ? await updateReservationAction(modal.original.id, modal.values)
        : await createReservationAction(modal.values);
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error.fields?.form ?? result.error.message);
      return;
    }
    closeModal();
    setToast(modal.mode === "edit" ? "Reservation updated." : "Reservation created.");
    await load();
  }

  async function cancel(id: string) {
    const result = await cancelReservationAction(id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setToast("Reservation cancelled.");
    await load();
  }

  return (
    <PageShell>
      <PageHeader
        title="Reservations"
        description="Create, edit, and cancel bookings. Overlapping times for the same resource are rejected."
        actions={
          <Button type="button" onClick={() => setModal({ mode: "create", values: emptyInput(resources[0]?.id ?? "") })}>
            New reservation
          </Button>
        }
      />
      {toast ? (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 shadow-sm">
          <BadgeCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          {toast}
        </p>
      ) : null}
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-5 pt-3.5">
          <h2 className="text-sm font-semibold text-zinc-900">All reservations</h2>
          {!loading ? (
            <p className="text-xs text-zinc-500">
              <span className="font-semibold tabular-nums text-zinc-900">{items.length}</span>{" "}
              {items.length === 1 ? "result" : "results"}
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 border-b border-zinc-200 bg-white pt-3 px-3 pb-4 sm:grid-cols-4">
          <select
            className={controlClass()}
            value={filters.resourceId}
            onChange={(e) => updateFilters((f) => ({ ...f, resourceId: e.target.value }))}
          >
            <option value="">All resources</option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </select>
          <select
            className={controlClass()}
            value={filters.status}
            onChange={(e) => updateFilters((f) => ({ ...f, status: e.target.value as Filters["status"] }))}
          >
            <option value="all">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input type="date" className={controlClass()} value={filters.from} onChange={(e) => updateFilters((f) => ({ ...f, from: e.target.value }))} />
          <input type="date" className={controlClass()} value={filters.to} onChange={(e) => updateFilters((f) => ({ ...f, to: e.target.value }))} />
        </div>

        {loading ? (
          <Skeleton className="m-4 h-64 rounded-xl" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="No reservations match these filters"
            description="Try another date range or create a new booking."
          />
        ) : (
          <>
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full min-w-212.5 table-fixed text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="w-[16%] px-5 py-2.5 font-medium">Title</th>
                    <th className="w-[16%] px-3 py-2.5 font-medium">Resource</th>
                    <th className="w-[24%] px-3 py-2.5 font-medium">When</th>
                    <th className="w-[14%] px-3 py-2.5 font-medium">Booked by</th>
                    <th className="w-[12%] px-3 py-2.5 font-medium">Status</th>
                    <th className="w-[18%] px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {visibleItems.map((item) => {
                    const canManage = user ? canManageReservation(user, item.userId) : false;
                    const endDate = reservationEndDate(item.date, item.startTime, item.endTime);
                    return (
                      <tr
                        key={item.id}
                        className="group transition-colors hover:bg-sky-50/60 focus-within:bg-sky-50/60"
                      >
                        <td className="relative truncate px-5 py-3.5 font-medium text-zinc-900">
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sky-500 opacity-0 transition-opacity group-hover:opacity-100"
                          />
                          {item.title}
                        </td>
                        <td className="px-3 py-3.5 text-zinc-600">
                          <span className="flex min-w-0 items-center gap-2">
                            <Boxes
                              className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition-colors group-hover:text-sky-600"
                              aria-hidden="true"
                            />
                            <span className="truncate">{resourceName[item.resourceId] ?? "Unknown"}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-zinc-600">
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
                        <td className="px-3 py-3.5 text-zinc-600">
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600 transition-colors group-hover:bg-sky-100 group-hover:text-sky-700"
                            >
                              {initials(item.bookedBy)}
                            </span>
                            <span className="truncate">{item.bookedBy}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3.5">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {canManage && item.status !== "cancelled" ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="compact"
                                onClick={() =>
                                  setModal({
                                    mode: "edit",
                                    original: item,
                                    values: {
                                      resourceId: item.resourceId,
                                      title: item.title,
                                      date: item.date,
                                      startTime: item.startTime,
                                      endTime: item.endTime,
                                      attendees: item.attendees,
                                      notes: item.notes ?? "",
                                    },
                                  })
                                }
                              >
                                Edit
                              </Button>
                              <Button type="button" variant="danger" size="compact" onClick={() => cancel(item.id)}>
                                Cancel
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination page={currentPage} totalItems={items.length} label="reservations" onPageChange={setPage} />
          </>
        )}
      </section>

      {modal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
                {modal.mode === "edit" ? "Edit reservation" : "New reservation"}
              </h2>
            </div>
            <div className="mt-5 grid gap-3">
              <Field label="Title">
                <input
                  className={controlClass()}
                  value={modal.values.title}
                  onChange={(e) => setModal((m) => m && { ...m, values: { ...m.values, title: e.target.value } })}
                />
              </Field>
              <Field label="Resource">
                <select
                  className={controlClass()}
                  value={modal.values.resourceId}
                  onChange={(e) => setModal((m) => m && { ...m, values: { ...m.values, resourceId: e.target.value } })}
                >
                  <option value="">Select a resource…</option>
                  {resources.map((resource) => (
                    <option key={resource.id} value={resource.id} disabled={!resource.isActive && resource.id !== modal.values.resourceId}>
                      {resource.name}
                      {resource.isActive ? "" : " (unavailable)"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  className={controlClass()}
                  value={modal.values.date}
                  onChange={(e) => setModal((m) => m && { ...m, values: { ...m.values, date: e.target.value } })}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start">
                  <select
                    className={controlClass()}
                    value={modal.values.startTime}
                    onChange={(e) => setModal((m) => {
                      if (!m) return m;
                      const startTime = e.target.value;
                      const previousStart = m.values.startTime;
                      const previousEnd = m.values.endTime;
                      const wasOvernight = previousEnd <= previousStart;
                      const endTime =
                        previousEnd === startTime || (!wasOvernight && previousEnd < startTime)
                          ? TIME_OPTIONS[(TIME_OPTIONS.indexOf(startTime) + 4) % TIME_OPTIONS.length] ?? m.values.endTime
                          : m.values.endTime;
                      return { ...m, values: { ...m.values, startTime, endTime } };
                    })}
                  >
                    {TIME_OPTIONS.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="End">
                  <select
                    className={controlClass()}
                    value={modal.values.endTime}
                    onChange={(e) => setModal((m) => m && { ...m, values: { ...m.values, endTime: e.target.value } })}
                  >
                    {TIME_OPTIONS.filter((time) => time !== modal.values.startTime).map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Attendees">
                <input
                  type="number"
                  min={1}
                  max={resources.find((resource) => resource.id === modal.values.resourceId)?.capacity ?? undefined}
                  className={controlClass()}
                  value={modal.values.attendees}
                  onChange={(e) =>
                    setModal((m) =>
                      m && { ...m, values: { ...m.values, attendees: Number(e.target.value) } },
                    )
                  }
                />
              </Field>
              <Field label="Notes">
                <textarea
                  className={controlClass()}
                  rows={3}
                  value={modal.values.notes}
                  onChange={(e) => setModal((m) => m && { ...m, values: { ...m.values, notes: e.target.value } })}
                />
              </Field>
              {formError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-zinc-100 pt-4">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Close
              </Button>
              <Button type="button" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

export default function ReservationsPage() {
  return (
    <Suspense fallback={<PageShell><Skeleton className="h-64 rounded-2xl" /></PageShell>}>
      <ReservationsClient />
    </Suspense>
  );
}