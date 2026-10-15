"use client";

import {
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorBanner, Skeleton } from "@/components/ui/EmptyState";
import { PageHeader, PageShell } from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/dates";
import type { NotificationView } from "@/lib/domain";
import { Bell } from "lucide-react";
import { startTransition, useCallback, useEffect, useState } from "react";

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listNotificationsAction();
    if (result.ok) {
      setItems(result.data);
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

  async function markOne(id: string) {
    const result = await markNotificationReadAction(id);
    if (result.ok) await load();
  }

  async function markAll() {
    await markAllNotificationsReadAction();
    await load();
  }

  const unread = items.filter((item) => !item.isRead).length;

  return (
    <PageShell>
      <PageHeader
        title="Notifications"
        description="Updates about reservations you own."
        actions={
          unread > 0 ? (
            <Button type="button" variant="secondary" onClick={markAll}>
              Mark all as read
            </Button>
          ) : null
        }
      />
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      {loading ? (
        <Skeleton className="h-48" />
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="Reservation confirmations and cancellations will appear here." />
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {items.map((item) => (
            <li key={item.id} className={`flex min-w-0 items-start gap-3 px-4 py-3 ${item.isRead ? "bg-white" : "bg-sky-50/60"}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                <p className="mt-0.5 text-sm text-zinc-600">{item.message}</p>
                <p className="mt-1 text-xs text-zinc-500">{formatDateTime(new Date(item.createdAt))}</p>
              </div>
              {!item.isRead ? (
                <Button type="button" variant="ghost" onClick={() => markOne(item.id)}>
                  Mark read
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
