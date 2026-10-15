import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-zinc-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PageShell({ children, fill }: { children: ReactNode; fill?: boolean }) {
  return (
    <div className={`mx-auto w-full max-w-8xl px-4 py-6 sm:px-6 ${fill ? "flex h-full min-h-0 min-w-0 max-w-none flex-col" : ""}`}>
      {children}
    </div>
  );
}
