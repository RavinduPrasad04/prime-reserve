"use client";

import { createReservationAction } from "@/app/actions/reservations";
import { listResourcesAction } from "@/app/actions/resources";
import { Button } from "@/components/ui/Button";
import { Field, controlClass } from "@/components/ui/Field";
import type { ReservationInput, Resource } from "@/lib/domain";
import type { QuickBookRequest } from "@/lib/quick-book";
import { TIME_OPTIONS } from "@/lib/time-options";
import { useEffect, useState } from "react";

export default function QuickBookReservationModal({
  request,
  onClose,
}: {
  request: QuickBookRequest;
  onClose: () => void;
}) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [values, setValues] = useState<ReservationInput>({
    resourceId: request.resourceId,
    title: "",
    date: request.date,
    startTime: request.startTime,
    endTime: request.endTime,
    attendees: 1,
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listResourcesAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setResources(result.data);
      else setResourceError(result.error.message);
      setLoadingResources(false);
    }).catch((caught: unknown) => {
      if (cancelled) return;
      console.error(
        "Quick Book could not load resources.",
        caught instanceof Error ? `${caught.name}: ${caught.message}` : "Unknown error",
      );
      setResourceError("Could not load resources. Close this dialog and try again.");
      setLoadingResources(false);
    });
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await createReservationAction(values);
    setSaving(false);
    if (!result.ok) {
      setError(result.error.fields?.form ?? result.error.message);
      return;
    }
    setSaved(true);
  }

  return (
    <div
      className="fixed inset-0 z-60 grid place-items-center overflow-y-auto bg-zinc-900/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-book-title"
        className="my-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <h2 id="quick-book-title" className="text-lg font-semibold text-zinc-900">
          New reservation
        </h2>
        <p className="mt-1 text-sm text-zinc-500">Complete the booking details for the selected available time.</p>

        {saved ? (
          <div className="mt-4 space-y-4">
            <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Reservation created successfully.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            {resourceError ? (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{resourceError}</p>
            ) : (
              <div className="mt-4 grid gap-3">
                <Field label="Title">
                  <input
                    required
                    maxLength={100}
                    className={controlClass()}
                    value={values.title}
                    onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
                  />
                </Field>
                <Field label="Resource">
                  <select
                    required
                    disabled={loadingResources}
                    className={controlClass()}
                    value={values.resourceId}
                    onChange={(event) => setValues((current) => ({ ...current, resourceId: event.target.value }))}
                  >
                    <option value="">Select a resource…</option>
                    {resources.map((resource) => (
                      <option key={resource.id} value={resource.id} disabled={!resource.isActive}>
                        {resource.name}{resource.isActive ? "" : " (unavailable)"}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Date">
                  <input
                    required
                    type="date"
                    className={controlClass()}
                    value={values.date}
                    onChange={(event) => setValues((current) => ({ ...current, date: event.target.value }))}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Start time">
                    <select
                      className={controlClass()}
                      value={values.startTime}
                      onChange={(event) => setValues((current) => ({ ...current, startTime: event.target.value }))}
                    >
                      {TIME_OPTIONS.map((time) => <option key={time} value={time}>{time}</option>)}
                    </select>
                  </Field>
                  <Field label="End time">
                    <select
                      className={controlClass()}
                      value={values.endTime}
                      onChange={(event) => setValues((current) => ({ ...current, endTime: event.target.value }))}
                    >
                      {TIME_OPTIONS.filter((time) => time !== values.startTime).map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Attendees">
                  <input
                    required
                    type="number"
                    min={1}
                    max={resources.find((resource) => resource.id === values.resourceId)?.capacity}
                    className={controlClass()}
                    value={values.attendees}
                    onChange={(event) => setValues((current) => ({ ...current, attendees: Number(event.target.value) }))}
                  />
                </Field>
                <Field label="Notes (optional)">
                  <textarea
                    rows={3}
                    maxLength={500}
                    className={controlClass()}
                    value={values.notes}
                    onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
                  />
                </Field>
                {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button>
              {!resourceError ? (
                <Button type="button" disabled={saving || loadingResources || resources.length === 0} onClick={save}>
                  {saving ? "Saving…" : "Create reservation"}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
