"use client";

import { currentUserAction } from "@/app/actions/auth";
import { createUserAction, listUsersAction, setUserActiveAction, updateUserAction } from "@/app/actions/users";
import { Button } from "@/components/ui/Button";
import { TABLE_PAGE_SIZE, TablePagination } from "@/components/ui/TablePagination";
import { EmptyState, ErrorBanner, Skeleton } from "@/components/ui/EmptyState";
import { Field, controlClass } from "@/components/ui/Field";
import { PageHeader, PageShell } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Badge";
import type { SessionUserView, UserView } from "@/lib/domain";
import { Users } from "lucide-react";
import { startTransition, useCallback, useEffect, useState } from "react";

type UserForm = {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "MEMBER";
  isActive: boolean;
  department: string;
  jobTitle: string;
};

const emptyForm: UserForm = { name: "", email: "", password: "", role: "MEMBER", isActive: true, department: "", jobTitle: "" };

export default function UsersPage() {
  const [actor, setActor] = useState<SessionUserView | null>(null);
  const [users, setUsers] = useState<UserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserView | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [page, setPage] = useState(1);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(users.length / TABLE_PAGE_SIZE)));
  const visibleUsers = users.slice((currentPage - 1) * TABLE_PAGE_SIZE, currentPage * TABLE_PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    const [nextActor, result] = await Promise.all([currentUserAction(), listUsersAction()]);
    setActor(nextActor);
    if (result.ok) {
      setUsers(result.data);
      setError(null);
    } else {
      setError(result.error.message);
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

  function openEdit(user: UserView) {
    setForm({ name: user.name, email: user.email, password: "", role: user.role, isActive: user.isActive, department: user.department ?? "", jobTitle: user.jobTitle ?? "" });
    setFormError(null);
    setEditing(user);
  }

  async function saveUser() {
    setSaving(true);
    setFormError(null);
    const result =
      editing === "new"
        ? await createUserAction({ name: form.name, email: form.email, password: form.password, role: form.role, department: form.department, jobTitle: form.jobTitle })
        : editing
          ? await updateUserAction(editing.id, form)
          : null;
    setSaving(false);
    if (!result) return;
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    const wasNew = editing === "new";
    setEditing(null);
    setForm(emptyForm);
    setToast(wasNew ? "User created." : "User updated.");
    await load();
  }

  async function toggleActive(user: UserView) {
    const result = await setUserActiveAction(user.id, !user.isActive);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setToast(result.data.isActive ? "Account reactivated." : "Account deactivated.");
    await load();
  }

  return (

      <PageShell>
        <PageHeader
          title="Users"
          description="Admin-only account management."
          actions={
            actor?.role === "ADMIN" ? (
              <Button type="button" onClick={openCreate}>
                Add user
              </Button>
            ) : null
          }
        />

        {toast ? (
          <p className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 shadow-sm">
            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
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
        ) : actor?.role !== "ADMIN" ? (
          <EmptyState
            icon={Users}
            title="Admins only"
            description="Ask an administrator if you need an account change."
          />
        ) : users.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users yet"
            description="Create the first account to get started."
            action={<Button onClick={openCreate}>Add user</Button>}
          />
        ) : (
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-zinc-900">
                All users
              </h2>
              <p className="text-xs text-zinc-500">
                <span className="font-semibold tabular-nums text-zinc-900">
                  {users.length}
                </span>{" "}
                {users.length === 1 ? "user" : "users"}
              </p>
            </div>

            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full min-w-180 text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      User
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Role
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Department
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Job title
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-100">
                  {visibleUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="group text-zinc-700 transition-colors hover:bg-sky-50/60 focus-within:bg-sky-50/60"
                    >
                      <td className="relative px-5 py-3.5">
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sky-500 opacity-0 transition-opacity group-hover:opacity-100"
                        />
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-zinc-200 bg-zinc-50 text-sm font-semibold text-zinc-600 transition-colors group-hover:border-sky-200 group-hover:bg-sky-50 group-hover:text-sky-700"
                          >
                            {user.name.trim().charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-900">
                              {user.name}
                            </p>
                            <p className="break-all text-xs text-zinc-500">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        <Pill>
                          {user.role === "ADMIN" ? "Admin" : "Member"}
                        </Pill>
                      </td>

                      <td className="px-5 py-3.5">
                        <Pill
                          className={
                            user.isActive
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-amber-50 text-amber-800"
                          }
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </Pill>
                      </td>

                      <td className="px-5 py-3.5 text-zinc-600">
                        {user.department || "—"}
                      </td>

                      <td className="px-5 py-3.5 text-zinc-600">
                        {user.jobTitle || "—"}
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="compact"
                            onClick={() => openEdit(user)}
                          >
                            Edit
                          </Button>

                          <Button
                            type="button"
                            size="compact"
                            variant={user.isActive ? "danger" : "secondary"}
                            onClick={() => toggleActive(user)}
                            disabled={actor.id === user.id && user.isActive}
                          >
                            {user.isActive ? "Deactivate" : "Reactivate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <TablePagination
              page={currentPage}
              totalItems={users.length}
              label="users"
              onPageChange={setPage}
            />
          </section>
        )}

        {editing ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/40 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
                  <Users className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
                  {editing === "new" ? "Add user" : "Edit user"}
                </h2>
              </div>

              <div className="mt-5 grid gap-3">
                <Field label="Name">
                  <input
                    maxLength={100}
                    className={controlClass()}
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </Field>

                <Field label="Email">
                  <input
                    type="email"
                    maxLength={255}
                    className={controlClass()}
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </Field>

                <Field label="Department">
                  <input
                    maxLength={100}
                    className={controlClass()}
                    value={form.department}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, department: e.target.value }))
                    }
                    placeholder="e.g. Engineering"
                  />
                </Field>

                <Field label="Job Title">
                  <input
                    maxLength={100}
                    className={controlClass()}
                    value={form.jobTitle}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, jobTitle: e.target.value }))
                    }
                    placeholder="e.g. Software Engineer"
                  />
                </Field>

                <Field label={editing === "new" ? "Password" : "New password"}>
                  <input
                    type="password"
                    minLength={8}
                    required={editing === "new"}
                    autoComplete="new-password"
                    placeholder={
                      editing === "new"
                        ? ""
                        : "Leave blank to keep the current password"
                    }
                    className={controlClass()}
                    value={form.password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }
                  />
                </Field>

                <Field label="Role">
                  <select
                    className={controlClass()}
                    value={form.role}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        role: e.target.value as "ADMIN" | "MEMBER",
                      }))
                    }
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </Field>

                {editing !== "new" ? (
                  <Field label="Account status">
                    <select
                      className={controlClass()}
                      value={form.isActive ? "active" : "inactive"}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          isActive: e.target.value === "active",
                        }))
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </Field>
                ) : null}

                {formError ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {formError}
                  </p>
                ) : null}
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-zinc-100 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={saveUser}
                >
                  {saving
                    ? "Saving…"
                    : editing === "new"
                      ? "Create"
                      : "Save"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </PageShell>

  );
}