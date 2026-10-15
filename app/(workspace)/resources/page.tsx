"use client";

import {
  createResourceAction,
  deleteResourceAction,
  listResourcesAction,
  updateResourceAction,
} from "@/app/actions/resources";
import { currentUserAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorBanner, Skeleton } from "@/components/ui/EmptyState";
import { Field, controlClass } from "@/components/ui/Field";
import { PageHeader, PageShell } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Badge";
import { TABLE_PAGE_SIZE, TablePagination } from "@/components/ui/TablePagination";
import {
  COLOR_PRESETS,
  RESOURCE_TYPE_LABEL,
  type Resource,
  type ResourceType,
  type SessionUserView,
} from "@/lib/domain";
import { BadgeCheck, Boxes, Camera, Car, DoorOpen, Users, Wrench } from "lucide-react";
import { startTransition, useCallback, useEffect, useState } from "react";

const TYPES: ResourceType[] = ["ROOM", "STUDIO", "EQUIPMENT", "VEHICLE"];

// Presentation only: one icon per resource type
const TYPE_ICON: Record<ResourceType, typeof Boxes> = {
  ROOM: DoorOpen,
  STUDIO: Camera,
  EQUIPMENT: Wrench,
  VEHICLE: Car,
};

type FormState = {
  name: string;
  type: ResourceType;
  description: string;
  location: string;
  capacity: string;
  color: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  name: "",
  type: "ROOM",
  description: "",
  location: "",
  capacity: "4",
  color: COLOR_PRESETS[0].hex,
  isActive: true,
};

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [user, setUser] = useState<SessionUserView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<Resource | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const isAdmin = user?.role === "ADMIN";
  const currentPage = Math.min(page, Math.max(1, Math.ceil(resources.length / TABLE_PAGE_SIZE)));
  const visibleResources = resources.slice((currentPage - 1) * TABLE_PAGE_SIZE, currentPage * TABLE_PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    const [resourceResult, nextUser] = await Promise.all([listResourcesAction(), currentUserAction()]);
    setUser(nextUser);
    if (resourceResult.ok) {
      setResources(resourceResult.data);
      setError(null);
    } else {
      setError(resourceResult.error.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  function openCreate() {
    setForm(emptyForm);
    setFormError(null);
    setEditing("new");
  }

  function openEdit(resource: Resource) {
    setForm({
      name: resource.name,
      type: resource.type,
      description: resource.description ?? "",
      location: resource.location,
      capacity: String(resource.capacity),
      color: resource.colorHex,
      isActive: resource.isActive,
    });
    setFormError(null);
    setEditing(resource);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    const payload = {
      name: form.name,
      type: form.type,
      description: form.description,
      location: form.location,
      capacity: Number(form.capacity),
      color: form.color,
      isActive: form.isActive,
    };
    const result =
      editing === "new" ? await createResourceAction(payload) : await updateResourceAction((editing as Resource).id, payload);
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    setEditing(null);
    setToast(editing === "new" ? "Resource created." : "Resource updated.");
    await load();
  }

  async function deactivate(id: string) {
    const result = await deleteResourceAction(id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setToast(result.data.deactivated ? "Resource deactivated because it has reservations." : "Resource removed.");
    await load();
  }

  return (
    <PageShell>
      <PageHeader
        title="Resources"
        description="Rooms, studios, equipment, and vehicles available for booking."
        actions={
          isAdmin ? (
            <Button type="button" onClick={openCreate}>
              Add resource
            </Button>
          ) : null
        }
      />
      {toast ? (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 shadow-sm">
          <BadgeCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          {toast}
        </p>
      ) : null}
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : resources.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No resources yet"
          description={isAdmin ? "Add a room or piece of equipment to start taking reservations." : "Ask an admin to add bookable resources."}
          action={isAdmin ? <Button onClick={openCreate}>Add resource</Button> : null}
        />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-zinc-900">All resources</h2>
            <p className="text-xs text-zinc-500">
              <span className="font-semibold tabular-nums text-zinc-900">{resources.length}</span>{" "}
              {resources.length === 1 ? "resource" : "resources"}
            </p>
          </div>
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">Resource</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Type</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Capacity</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Availability</th>
                  {isAdmin ? <th scope="col" className="px-5 py-2.5 font-medium">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {visibleResources.map((resource) => {
                  const TypeIcon = TYPE_ICON[resource.type] ?? Boxes;
                  return (
                    <tr
                      key={resource.id}
                      className="group text-zinc-700 transition-colors hover:bg-sky-50/60 focus-within:bg-sky-50/60"
                    >
                      <td className="relative px-5 py-3.5 font-medium text-zinc-900">
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sky-500 opacity-0 transition-opacity group-hover:opacity-100"
                        />
                        <span className="inline-flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white transition-transform group-hover:scale-125 motion-reduce:transform-none"
                            style={{ backgroundColor: resource.colorHex }}
                          />
                          {resource.name}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-2">
                          <TypeIcon
                            className="h-3.5 w-3.5 text-zinc-400 transition-colors group-hover:text-sky-600"
                            aria-hidden="true"
                          />
                          {RESOURCE_TYPE_LABEL[resource.type]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-2 tabular-nums">
                          <Users
                            className="h-3.5 w-3.5 text-zinc-400 transition-colors group-hover:text-sky-600"
                            aria-hidden="true"
                          />
                          {resource.capacity}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <Pill className={resource.isActive ? "" : "bg-amber-50 text-amber-800"}>
                          {resource.isActive ? "Available" : "Unavailable"}
                        </Pill>
                      </td>
                      {isAdmin ? (
                        <td className="px-5 py-3.5">
                          <div className="flex gap-2">
                            <Button type="button" size="compact" onClick={() => openEdit(resource)}>
                              Edit
                            </Button>
                            {resource.isActive ? (
                              <Button type="button" variant="danger" size="compact" onClick={() => deactivate(resource.id)}>
                                Deactivate
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination page={currentPage} totalItems={resources.length} label="resources" onPageChange={setPage} />
        </section>
      )}

      {editing ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
                <Boxes className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
                {editing === "new" ? "Add resource" : "Edit resource"}
              </h2>
            </div>
            <div className="mt-5 grid gap-3">
              <Field label="Name" error={formError && !form.name.trim() ? formError : undefined}>
                <input className={controlClass()} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field label="Type">
                <select className={controlClass()} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ResourceType }))}>
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {RESOURCE_TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Location">
                <input className={controlClass()} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
              </Field>
              <Field label="Capacity">
                <input
                  type="number"
                  min={1}
                  className={controlClass()}
                  value={form.capacity}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                />
              </Field>
              <Field label="Colour">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-6 w-6 shrink-0 rounded-full ring-2 ring-zinc-200 transition-colors"
                    style={{ backgroundColor: form.color }}
                  />
                  <select className={controlClass()} value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}>
                    {COLOR_PRESETS.map((color) => (
                      <option key={color.hex} value={color.hex}>
                        {color.label}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
              <Field label="Description">
                <textarea className={controlClass()} rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </Field>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700 transition-colors hover:bg-sky-50/60">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                Available for booking
              </label>
              {formError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-zinc-100 pt-4">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
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