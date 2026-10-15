import { CircleCheck, CircleX, Clock } from "lucide-react";
import type { ReservationStatus } from "@/lib/domain";

const STATUS = {
  confirmed: {
    label: "Confirmed",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Icon: CircleCheck,
  },
  pending: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
    Icon: Clock,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    Icon: CircleX,
  },
};

export function StatusBadge({ status }: { status: ReservationStatus }) {
  const meta = STATUS[status];
  const Icon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

export function Pill({ children, className = "" }: { children: string; className?: string }) {
  return (
    <span className={`inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 ${className}`}>
      {children}
    </span>
  );
}
