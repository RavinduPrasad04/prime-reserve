"use client";

import { checkAvailabilityAction, type AvailabilityQuery, type AvailabilityResult } from "@/app/actions/reservations";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/EmptyState";
import { Field, controlClass } from "@/components/ui/Field";
import { RESOURCE_TYPE_LABEL, type ResourceType } from "@/lib/domain";
import { toISODate } from "@/lib/dates";
import { TIME_OPTIONS } from "@/lib/time-options";
import { dispatchQuickBook } from "@/lib/quick-book";
import { X, Zap } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

const RESOURCE_TYPES: ResourceType[] = ["ROOM", "STUDIO", "EQUIPMENT", "VEHICLE"];

function QuickAvailabilityPanel({ idPrefix, onBook }: { idPrefix: string; onBook?: () => void }) {
  const [query, setQuery] = useState<AvailabilityQuery>({
    resourceType: "ALL",
    date: toISODate(new Date()),
    startTime: "09:00",
    endTime: "10:00",
  });
  const [results, setResults] = useState<AvailabilityResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateQuery(update: (current: AvailabilityQuery) => AvailabilityQuery) {
    setQuery(update);
    setResults(null);
    setError(null);
  }

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await checkAvailabilityAction(query);
    setLoading(false);
    if (!response.ok) {
      setError(response.error.message);
      setResults(null);
      return;
    }
    setResults(response.data);
  }

  function bookResource(resourceId: string) {
    dispatchQuickBook({
      resourceId,
      date: query.date,
      startTime: query.startTime,
      endTime: query.endTime,
    });
    onBook?.();
  }

  return (
    <div>
      <form onSubmit={check} className="grid gap-3 sm:grid-cols-2">
        <Field label="Resource type" htmlFor={`${idPrefix}-type`}>
          <select
            id={`${idPrefix}-type`}
            className={controlClass()}
            value={query.resourceType}
            onChange={(event) =>
              updateQuery((current) => ({ ...current, resourceType: event.target.value as AvailabilityQuery["resourceType"] }))
            }
          >
            <option value="ALL">All resource types</option>
            {RESOURCE_TYPES.map((type) => (
              <option key={type} value={type}>{RESOURCE_TYPE_LABEL[type]}</option>
            ))}
          </select>
        </Field>
        <Field label="Date" htmlFor={`${idPrefix}-date`}>
          <input
            id={`${idPrefix}-date`}
            type="date"
            required
            className={controlClass()}
            value={query.date}
            onChange={(event) => updateQuery((current) => ({ ...current, date: event.target.value }))}
          />
        </Field>
        <Field label="Start time" htmlFor={`${idPrefix}-start`}>
          <select
            id={`${idPrefix}-start`}
            className={controlClass()}
            value={query.startTime}
            onChange={(event) =>
              updateQuery((current) => ({
                ...current,
                startTime: event.target.value,
                endTime: TIME_OPTIONS[(TIME_OPTIONS.indexOf(event.target.value) + 4) % TIME_OPTIONS.length] ?? current.endTime,
              }))
            }
          >
            {TIME_OPTIONS.map((time) => <option key={time}>{time}</option>)}
          </select>
        </Field>
        <Field label="End time" htmlFor={`${idPrefix}-end`}>
          <select
            id={`${idPrefix}-end`}
            className={controlClass()}
            value={query.endTime}
            onChange={(event) => updateQuery((current) => ({ ...current, endTime: event.target.value }))}
          >
            {TIME_OPTIONS.filter((time) => time !== query.startTime).map((time) => <option key={time}>{time}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={loading} className="w-full sm:w-auto">
            {loading ? "Checking…" : "Check availability"}
          </Button>
        </div>
      </form>
      {error ? <div className="mt-3"><ErrorBanner message={error} /></div> : null}
      {results ? (
        <section aria-live="polite" className="mt-4 border-t border-zinc-100 pt-3">
          <h3 className="mb-2 text-sm font-semibold text-zinc-900">Availability results</h3>
          {results.length === 0 ? (
            <p className="text-sm text-zinc-500">No resources match this type.</p>
          ) : (
            <ul className="max-h-64 divide-y divide-zinc-100 overflow-y-auto">
              {results.map((resource) => (
                <li key={resource.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{resource.name}</p>
                    <p className="text-xs text-zinc-500">
                      {RESOURCE_TYPE_LABEL[resource.type]} · Capacity {resource.capacity}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`text-xs font-medium ${resource.available ? "text-emerald-700" : "text-zinc-500"}`}>
                      {resource.available ? "Available" : resource.reason}
                    </span>
                    {resource.available ? (
                      <Button type="button" size="compact" onClick={() => bookResource(resource.id)}>
                        Book this resource
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

export function QuickAvailabilityPageContent() {
  return <QuickAvailabilityPanel idPrefix="quick-availability-page" />;
}

export default function QuickAvailabilityWidget() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open quick availability"
        title="Quick availability"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 grid size-12 place-items-center rounded-full bg-zinc-900 text-white shadow-lg transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
      >
        <Zap size={20} aria-hidden="true" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/40 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-availability-title"
            className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="quick-availability-title" className="text-lg font-semibold text-zinc-900">Quick availability</h2>
                <p className="mt-1 text-sm text-zinc-500">Find resources available for your time range.</p>
              </div>
              <button
                type="button"
                aria-label="Close quick availability"
                onClick={() => setOpen(false)}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <QuickAvailabilityPanel idPrefix="quick-availability-modal" onBook={() => setOpen(false)} />
          </section>
        </div>
      ) : null}
    </>
  );
}
