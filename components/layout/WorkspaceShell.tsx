"use client";

import Topbar from "@/components/layout/Topbar";
import Sidebar from "@/components/layout/Sidebar";
import QuickAvailabilityWidget from "@/components/layout/QuickAvailabilityWidget";
import QuickBookReservationModal from "@/components/layout/QuickBookReservationModal";
import { currentUserAction } from "@/app/actions/auth";
import { unreadCountAction } from "@/app/actions/notifications";
import { QUICK_BOOK_EVENT, type QuickBookRequest } from "@/lib/quick-book";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { SessionUserView } from "@/lib/domain";

const STORAGE_KEY = "prime-reserve:sidebar-collapsed";
const listeners = new Set<() => void>();
let collapsedValue: boolean | null = null;

function readCollapsed(): boolean {
  if (collapsedValue === null) {
    try {
      collapsedValue = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      collapsedValue = false;
    }
  }
  return collapsedValue;
}

function writeCollapsed(value: boolean) {
  collapsedValue = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const [user, setUser] = useState<SessionUserView | null>(null);
  const [unread, setUnread] = useState(0);
  const [quickBookRequest, setQuickBookRequest] = useState<QuickBookRequest | null>(null);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const fillPage = pathname === "/calendar";

  useEffect(() => {
    let cancelled = false;
    currentUserAction().then((next) => {
      if (cancelled) return;
      if (!next) {
        router.replace("/login");
        return;
      }
      setUser(next);
    });
    unreadCountAction().then((count) => {
      if (!cancelled) setUnread(count);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  useEffect(() => {
    function onQuickBook(event: Event) {
      setQuickBookRequest((event as CustomEvent<QuickBookRequest>).detail);
    }
    window.addEventListener(QUICK_BOOK_EVENT, onQuickBook);
    return () => window.removeEventListener(QUICK_BOOK_EVENT, onQuickBook);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow"
      >
        Skip to content
      </a>
      <Sidebar
        open={mobileOpen}
        collapsed={collapsed}
        onClose={closeMobile}
        badges={{ notifications: unread }}
        role={user?.role ?? null}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          unreadCount={unread}
          menuOpen={mobileOpen}
          sidebarCollapsed={collapsed}
          onMenuToggle={() => setMobileOpen((v) => !v)}
          onSidebarCollapseToggle={() => writeCollapsed(!collapsed)}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className={`min-h-0 min-w-0 flex-1 outline-none ${fillPage ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          {children}
        </main>
      </div>
      <QuickAvailabilityWidget />
      {quickBookRequest ? (
        <QuickBookReservationModal request={quickBookRequest} onClose={() => setQuickBookRequest(null)} />
      ) : null}
    </div>
  );
}
