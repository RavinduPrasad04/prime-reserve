"use client";

import { registerAction } from "@/app/actions/auth";
import { CalendarRange } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await registerAction(formData);
    if (result.ok) {
      setSuccess(true);
    } else {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg border border-green-800 bg-green-800">
           <div className="text-white text-sm font-medium tracking-wide">PR</div>
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-900">Prime Reserve</p>
            <p className="text-xs text-zinc-500">Create a member account</p>
          </div>
        </div>

        {success ? (
          <div role="status" className="space-y-4">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Your account has been created. You can now sign in.
            </p>
            <Link
              href="/login"
              className="flex h-9 w-full items-center justify-center rounded-lg bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Go to sign in
            </Link>
          </div>
        ) : (
          <form action={onSubmit} className="space-y-3">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-zinc-700">Name</label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                maxLength={100}
                className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm focus:outline-2 focus:outline-zinc-400"
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={255}
                className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm focus:outline-2 focus:outline-zinc-400"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="department" className="mb-1 block text-sm font-medium text-zinc-700">
                  Department <span className="font-normal text-zinc-500">(optional)</span>
                </label>
                <input
                  id="department"
                  name="department"
                  type="text"
                  maxLength={100}
                  className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm focus:outline-2 focus:outline-zinc-400"
                />
              </div>
              <div>
                <label htmlFor="jobTitle" className="mb-1 block text-sm font-medium text-zinc-700">
                  Job title <span className="font-normal text-zinc-500">(optional)</span>
                </label>
                <input
                  id="jobTitle"
                  name="jobTitle"
                  type="text"
                  maxLength={100}
                  className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm focus:outline-2 focus:outline-zinc-400"
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm focus:outline-2 focus:outline-zinc-400"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-zinc-700">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm focus:outline-2 focus:outline-zinc-400"
              />
            </div>
            {error ? (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="flex h-9 w-full items-center justify-center rounded-lg bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {pending ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}

        {!success ? (
          <p className="mt-4 text-center text-sm text-zinc-600">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-zinc-900 underline underline-offset-4">
              Sign in
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
