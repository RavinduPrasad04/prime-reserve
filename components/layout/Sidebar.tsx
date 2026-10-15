"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  Boxes,
  CalendarDays,
  CalendarX,
  LayoutDashboard,
  UserRound,
  Users,
  CalendarRange,
  List,
  Zap,
  LogOut,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";

export type SidebarBadges = {
  reservations?: number;
  notifications?: number;
  calendar?: number;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  badgeKey?: keyof SidebarBadges;
  adminOnly?: boolean;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/quick-availability", label: "Quick Availability", icon: Zap },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    items: [
      { href: "/reservations", label: "Reservations", icon: List, badgeKey: "reservations" },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/booking-settings", label: "Booking Settings", icon: CalendarX, adminOnly: true },
      { href: "/resources", label: "Resources", icon: Boxes },
      { href: "/users", label: "Users", icon: Users },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell, badgeKey: "notifications" },
      { href: "/settings", label: "Profile", icon: UserRound },
    ],
  },
];

type SidebarProps = {
  open?: boolean;
  collapsed?: boolean;
  onClose?: () => void;
  badges?: SidebarBadges;
  role?: "ADMIN" | "MEMBER" | null;
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2";

export default function Sidebar({
  open = false,
  collapsed = false,
  onClose,
  badges = {},
  role = null,
}: SidebarProps) {
  const pathname = usePathname();

  useEffect(() => {
    if (!open || !onClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const [pending, setPending] = useState(false);


  async function signOut() {
    setPending(true);
    await logoutAction();
  }
  return (
    <>
      <button
        type="button"
        aria-label="Close navigation menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-zinc-900/30 transition-opacity lg:hidden ${open ? "visible opacity-100" : "pointer-events-none invisible opacity-0"
          }`}
      />

      <aside
        id="app-sidebar"
        aria-label="Application sidebar"
        className={`z-50 flex shrink-0 flex-col border-r border-zinc-200 bg-white text-zinc-600 transition-[width,transform,visibility] duration-200
          max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:h-dvh max-lg:w-72
          ${open ? "max-lg:visible max-lg:translate-x-0" : "max-lg:invisible max-lg:-translate-x-full"}
          lg:sticky lg:top-0 lg:h-dvh
          ${collapsed ? "lg:w-18" : "lg:w-60"}`}
      >
        <Link
          href="/dashboard"
          onClick={onClose}
          title={collapsed ? "Prime Reserve" : undefined}
          aria-label="Prime Reserve dashboard"
          className={`flex h-14 shrink-0 items-center border-b border-zinc-200 ${focusRing} ${collapsed ? "justify-center px-2" : "gap-2.5 px-4"
            }`}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-green-800 bg-green-800">
            <div className="text-white text-sm font-medium tracking-wide">PR</div>
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-zinc-900">Prime Reserve</span>
              <span className="block truncate text-[11px] text-zinc-500">Resource management</span>
            </span>
          )}
        </Link>

        <nav
          aria-label="Main navigation"
          className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-4 ${collapsed ? "px-2" : "px-3"}`}
        >
          {NAV_SECTIONS.map((section, sectionIndex) => (
            <div key={section.id} className={sectionIndex > 0 ? "mt-6" : ""}>
              {collapsed ? (
                <div aria-hidden="true" className={`mx-auto mb-3 h-px w-6 bg-zinc-200 ${sectionIndex === 0 ? "hidden" : ""}`} />
              ) : (
                <p
                  id={`nav-${section.id}`}
                  className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400"
                >
                  {section.label}
                </p>
              )}
              <ul aria-labelledby={collapsed ? undefined : `nav-${section.id}`} className="space-y-0.5">
                {section.items.filter((item) => (!item.adminOnly || role === "ADMIN") && (item.href !== "/users" || role === "ADMIN")).map((item) => {
                  const active = isActive(item.href);
                  const count = item.badgeKey ? badges[item.badgeKey] : undefined;
                  const ItemIcon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        title={collapsed ? item.label : undefined}
                        className={`flex min-h-9 items-center rounded-lg text-[13px] font-medium ${focusRing} ${collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
                          } ${active ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"}`}
                      >
                        <ItemIcon size={16} strokeWidth={active ? 2 : 1.75} className="shrink-0" />
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                        {!collapsed && typeof count === "number" && count > 0 && (
                          <span className="ml-auto min-w-5 rounded-md bg-zinc-200 px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-zinc-700">
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

        </nav>
        <button
          type="button"
          role="menuitem"
          disabled={pending}
          onClick={signOut}
          title={collapsed ? "Prime Reserve" : undefined}
          aria-label="Prime Reserve dashboard"
          className={`cursor-pointer text-red-500 hover:bg-zinc-50 hover:text-red-500 flex h-12 py-4 mb-2 shrink-0 items-center ${focusRing} ${collapsed ? "justify-center px-2" : "gap-2.5 px-4"
            }`}
        >
          <span className="grid rotate-180 size-8 shrink-0 place-items-center rounded-lg text-red-500">
            <LogOut size={16} strokeWidth={1.75} />

          </span>
          {!collapsed && (
            <span className="text-[13px] font-medium ">Sign out</span>

          )}
        </button>
      </aside>
    </>
  );
}
