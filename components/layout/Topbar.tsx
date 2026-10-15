"use client";

import { Bell, ChevronDown, LogOut, Menu, PanelLeft, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type FocusEvent } from "react";
import { logoutAction } from "@/app/actions/auth";
import type { SessionUserView } from "@/lib/domain";

export type TopbarProps = {
  menuOpen: boolean;
  sidebarCollapsed: boolean;
  onMenuToggle: () => void;
  onSidebarCollapseToggle: () => void;
  user?: SessionUserView | null;
  unreadCount?: number;
};

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  resources: "Resources",
  reservations: "Reservations",
  calendar: "Calendar",
  users: "Users",
  notifications: "Notifications",
  settings: "Profile",
};

function getCrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  let href = "";
  return segments.map((segment) => {
    href += `/${segment}`;
    return { href, label: SEGMENT_LABELS[segment] ?? segment };
  });
}

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2";
const iconButton = `grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 ${focusRing}`;

function UserMenu({ user }: { user: SessionUserView }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
  };

  async function signOut() {
    setPending(true);
    await logoutAction();
  }

  return (
    <div ref={rootRef} onBlur={onBlur} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-zinc-100 ${focusRing}`}
      >
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-800">
          {getInitials(user.name)}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-40 truncate text-sm font-medium text-zinc-900">{user.name}</span>
          <span className="block max-w-40 truncate text-xs text-zinc-500">{user.role === "ADMIN" ? "Admin" : "Member"}</span>
        </span>
        <ChevronDown className={`hidden h-4 w-4 text-zinc-400 md:block ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-11 z-50 w-56 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg"
        >
          <div className="border-b border-zinc-100 px-2.5 py-2">
            <p className="truncate text-sm font-medium text-zinc-900">{user.name}</p>
            <p className="truncate text-xs text-zinc-500">{user.email}</p>
          </div>
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50"
          >
            <UserRound size={15} />
            Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            <LogOut size={15} />
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Topbar({
  menuOpen,
  sidebarCollapsed,
  onMenuToggle,
  onSidebarCollapseToggle,
  user,
  unreadCount = 0,
}: TopbarProps) {
  const pathname = usePathname();
  const crumbs = getCrumbs(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label="Navigation menu"
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          className={`${iconButton} lg:hidden`}
        >
          <Menu size={18} />
        </button>
        <button
          type="button"
          onClick={onSidebarCollapseToggle}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`${iconButton} hidden lg:grid`}
        >
          <PanelLeft size={18} />
        </button>
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-1.5 text-sm">
            {crumbs.map((crumb, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 && <span className="text-zinc-300">/</span>}
                  {last ? (
                    <span className="truncate font-semibold text-zinc-900">{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} className={`text-zinc-500 hover:text-zinc-800 ${focusRing}`}>
                      {crumb.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
      <div className="flex flex-none items-center gap-1.5">
        <Link
          href="/reservations?new=1"
          className={`mr-1 inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 ${focusRing}`}
        >
          <Plus size={16} />
          <span className="hidden sm:inline">New reservation</span>
        </Link>
        <Link
          href="/notifications"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          className={`${iconButton} relative`}
        >
          <Bell size={18} />
          {unreadCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sky-500" />}
        </Link>
        {user ? <UserMenu user={user} /> : null}
      </div>
    </header>
  );
}
