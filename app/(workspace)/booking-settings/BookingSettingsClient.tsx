"use client";

import {
  createBookingBlockAction,
  deleteBookingBlockAction,
  getBookingSettingsAction,
  listBookingBlocksAction,
  updateBookingSettingsAction,
} from "@/app/actions/booking-settings";
import { Button } from "@/components/ui/Button";
import { controlClass, Field } from "@/components/ui/Field";
import type { BookingBlockView, BookingSettingsView } from "@/lib/domain";
import { toISODate } from "@/lib/dates";
import { CalendarX, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

type ResourceOption = { id: string; name: string };

export default function BookingSettingsClient({ resources }: { resources: ResourceOption[] }) {
  const [settings, setSettings] = useState<BookingSettingsView>({ restrictSaturday: false, restrictSunday: false });
  const [blocks, setBlocks] = useState<BookingBlockView[]>([]);
  const [date, setDate] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getBookingSettingsAction(), listBookingBlocksAction()]).then(([settingsResult, blockResult]) => {
      if (cancelled) return;
      setDate(toISODate(new Date()));
      if (!settingsResult.ok) {
        setError(settingsResult.error.message);
      } else if (!blockResult.ok) {
        setError(blockResult.error.message);
      } else {
        setSettings(settingsResult.data);
        setBlocks(blockResult.data);
      }
      setLoading(false);
    }).catch((caught: unknown) => {
      if (!cancelled) {
        setDate(toISODate(new Date()));
        console.error(
          "Booking settings page initialization failed.",
          caught instanceof Error ? `${caught.name}: ${caught.message}` : "Unknown error",
        );
        setError("Could not load booking settings. Refresh the page and try again.");
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  async function saveSettings(next: BookingSettingsView) {
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await updateBookingSettingsAction(next);
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSettings(result.data);
    setNotice("Weekend restrictions updated.");
  }

  async function addBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await createBookingBlockAction({ date, resourceId: resourceId || null, reason });
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setBlocks((current) => [...current, result.data].sort((a, b) => a.date.localeCompare(b.date)));
    setReason("");
    setNotice("Booking date blocked.");
  }

  async function removeBlock(id: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await deleteBookingBlockAction(id);
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setBlocks((current) => current.filter((block) => block.id !== id));
    setNotice("Booking block removed.");
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <CalendarX className="size-5 text-zinc-700" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-zinc-900">Booking Settings</h1>
        </div>
        <p className="mt-1 text-sm text-zinc-500">Manage booking restrictions for dates and weekends.</p>
      </header>

      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold text-zinc-900">Weekend booking restrictions</h2>
        <p className="mt-1 text-sm text-zinc-500">When enabled, all reservations overlapping that day are blocked.</p>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          {([
            ["restrictSaturday", "Restrict Saturday bookings"],
            ["restrictSunday", "Restrict Sunday bookings"],
          ] as const).map(([key, label]) => (
            <label key={key} className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={settings[key]}
                disabled={loading || saving}
                onChange={(event) => void saveSettings({ ...settings, [key]: event.target.checked })}
                className="size-4 rounded border-zinc-300 accent-zinc-900"
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold text-zinc-900">Block a date</h2>
        <p className="mt-1 text-sm text-zinc-500">Prevent reservations for every resource or one selected resource.</p>
        <form onSubmit={addBlock} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <Field label="Date" htmlFor="booking-block-date">
            <input id="booking-block-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} className={controlClass()} />
          </Field>
          <Field label="Resource" htmlFor="booking-block-resource">
            <select id="booking-block-resource" value={resourceId} onChange={(event) => setResourceId(event.target.value)} className={controlClass()}>
              <option value="">All resources</option>
              {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
            </select>
          </Field>
          <Field label="Reason (optional)" htmlFor="booking-block-reason">
            <input id="booking-block-reason" value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} className={controlClass()} placeholder="e.g. Building maintenance" />
          </Field>
          <Button type="submit" disabled={saving || loading}>Add block</Button>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">Blocked dates</h2>
          <p className="mt-1 text-sm text-zinc-500">{blocks.length} date restriction{blocks.length === 1 ? "" : "s"}</p>
        </div>
        <div className="max-h-112 overflow-auto">
          <table className="w-full min-w-160 border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Scope</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {blocks.map((block) => (
                <tr key={block.id}>
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-zinc-900">{block.date}</td>
                  <td className="px-5 py-3 text-zinc-700">{block.resourceName ?? "All resources"}</td>
                  <td className="px-5 py-3 text-zinc-600">{block.reason || "—"}</td>
                  <td className="px-5 py-3 text-right">
                    <Button type="button" variant="danger" size="compact" disabled={saving} onClick={() => void removeBlock(block.id)}>
                      <Trash2 size={14} aria-hidden="true" /> Remove
                    </Button>
                  </td>
                </tr>
              ))}
              {!loading && blocks.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-zinc-500">No booking dates are blocked.</td></tr>
              ) : null}
              {loading ? <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-zinc-500">Loading booking settings…</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
