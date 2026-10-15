"use client";

import { currentUserAction, updateProfileAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { ErrorBanner, Skeleton } from "@/components/ui/EmptyState";
import { Field, controlClass } from "@/components/ui/Field";
import { PageHeader, PageShell } from "@/components/ui/PageHeader";
import type { SessionUserView } from "@/lib/domain";
import { FormEvent, useEffect, useState } from "react";

type ProfileForm = {
  name: string;
  email: string;
  department: string;
  jobTitle: string;
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

export default function ProfilePage() {
  const [user, setUser] = useState<SessionUserView | null>(null);
  const [form, setForm] = useState<ProfileForm>({
    name: "",
    email: "",
    department: "",
    jobTitle: "",
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    currentUserAction().then((current) => {
      if (cancelled) return;
      setUser(current);
      if (current) {
        setForm({
          name: current.name,
          email: current.email,
          department: current.department ?? "",
          jobTitle: current.jobTitle ?? "",
          currentPassword: "",
          newPassword: "",
          confirmNewPassword: "",
        });
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setToast(null);
    const result = await updateProfileAction(form);
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setUser(result.data);
    setForm({
      name: result.data.name,
      email: result.data.email,
      department: result.data.department ?? "",
      jobTitle: result.data.jobTitle ?? "",
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    });
    setToast("Profile updated.");
  }

  return (
    <PageShell>
      <PageHeader title="Profile" description="View and update your account details." />
      {toast ? <p role="status" className="mb-4 max-w-lg rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{toast}</p> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? (
        <Skeleton className="h-64 max-w-3xl" />
      ) : user ? (
        <form onSubmit={save} className="max-w-3xl rounded-xl border border-zinc-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="profile-name">
              <input
                id="profile-name"
                autoComplete="name"
                maxLength={100}
                required
                minLength={2}
                className={controlClass()}
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="Email" htmlFor="profile-email">
              <input
                id="profile-email"
                type="email"
                autoComplete="email"
                maxLength={255}
                required
                className={controlClass()}
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="Department (optional)" htmlFor="profile-department">
              <input
                id="profile-department"
                autoComplete="organization"
                maxLength={100}
                className={controlClass()}
                value={form.department}
                onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
              />
            </Field>
            <Field label="Job title / Position (optional)" htmlFor="profile-job-title">
              <input
                id="profile-job-title"
                autoComplete="organization-title"
                maxLength={100}
                className={controlClass()}
                value={form.jobTitle}
                onChange={(event) => setForm((current) => ({ ...current, jobTitle: event.target.value }))}
              />
            </Field>
            <section aria-labelledby="profile-password-heading" className="border-t border-zinc-100 pt-4 sm:col-span-2">
              <h2 id="profile-password-heading" className="mb-3 text-sm font-semibold text-zinc-900">Change password</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Current Password" htmlFor="profile-current-password">
                  <input
                    id="profile-current-password"
                    type="password"
                    autoComplete="current-password"
                    className={controlClass()}
                    value={form.currentPassword}
                    onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value }))}
                  />
                </Field>
                <Field label="New Password" htmlFor="profile-new-password">
                  <input
                    id="profile-new-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    className={controlClass()}
                    value={form.newPassword}
                    onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))}
                  />
                </Field>
                <Field label="Confirm New Password" htmlFor="profile-confirm-password">
                  <input
                    id="profile-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    className={controlClass()}
                    value={form.confirmNewPassword}
                    onChange={(event) => setForm((current) => ({ ...current, confirmNewPassword: event.target.value }))}
                  />
                </Field>
              </div>
              <p className="mt-2 text-xs text-zinc-500">Leave all password fields blank to keep your current password.</p>
            </section>
            <div className="flex items-center justify-end border-t border-zinc-100 pt-4 sm:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
            </div>
          </div>
        </form>
      ) : (
        <p className="text-sm text-zinc-600">Sign in to manage your profile.</p>
      )}
    </PageShell>
  );
}
