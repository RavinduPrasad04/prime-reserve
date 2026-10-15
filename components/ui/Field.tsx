import type { ReactNode } from "react";

export const controlClass = (invalid?: boolean) =>
  `h-9 w-full rounded-lg border bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-2 focus:outline-offset-0 focus:outline-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-50 ${
    invalid ? "border-red-400" : "border-zinc-300"
  }`;

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-zinc-700">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
