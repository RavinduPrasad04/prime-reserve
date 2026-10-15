"use client";

import { loginAction } from "@/app/actions/auth";
import { CalendarRange } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await loginAction(formData);
    if (result && !result.ok) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg border border-green-800 bg-green-800">
            <div className="text-white text-sm font-medium tracking-wide">PR</div>
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-900">Prime Reserve</p>
            <p className="text-xs text-zinc-500">Sign in to manage bookings</p>
          </div>
        </div>
        <form action={onSubmit} className="space-y-3">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue="alex.morgan@primewave.lab"
              className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm focus:outline-2 focus:outline-zinc-400"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              defaultValue="DemoPass123!"
              className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm focus:outline-2 focus:outline-zinc-400"
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="flex h-9 w-full items-center justify-center rounded-lg bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-600">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-zinc-900 underline underline-offset-4">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
