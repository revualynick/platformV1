"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface SidebarProps {
  role: "employee" | "manager" | "admin";
  items: NavItem[];
  userName?: string;
}

const roleColors = {
  employee: "bg-forest",
  manager: "bg-forest-light",
  admin: "bg-terracotta",
};

const roleLabels = {
  employee: null,
  manager: "Manager",
  admin: "Admin",
};

export function Sidebar({ role, items, userName = "Sarah Chen" }: SidebarProps) {
  const pathname = usePathname();
  // Below lg the sidebar is a drawer opened from a top bar; from lg up it's
  // always visible (layouts offset <main> by 260px only at lg).
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
    {/* Mobile top bar */}
    <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-[#E2C39C] bg-[#FAEAD1]/95 px-4 backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="app-sidebar"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-900/5"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${roleColors[role]} text-white text-xs font-display font-semibold`}>R</div>
      <span className="font-display text-base font-semibold tracking-tight text-stone-900">Revualy</span>
    </div>

    {/* Backdrop for the mobile drawer */}
    {open && (
      <div className="fixed inset-0 z-40 bg-stone-900/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
    )}

    <aside
      id="app-sidebar"
      className={`fixed left-0 top-0 z-50 flex h-screen w-[260px] flex-col border-r border-[#E2C39C] bg-gradient-to-b from-[#FAEAD1] to-[#F6DFC2] overflow-hidden transition-transform duration-200 lg:z-auto lg:translate-x-0 ${
        open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      }`}
    >
      {/* Sheen overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-50" style={{ background: "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.35) 40%, transparent 80%)" }} />

      {/* Logo */}
      <div className="flex items-center gap-3 px-6 pt-8 pb-2">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${roleColors[role]} text-white text-sm font-display font-semibold`}
        >
          R
        </div>
        <div>
          <span className="font-display text-lg font-semibold tracking-tight text-stone-900">
            Revualy
          </span>
          {roleLabels[role] && (
            <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-stone-500">
              {roleLabels[role]}
            </span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="mt-8 flex-1 px-3">
        <ul className="space-y-1">
          {items.map((item) => {
            // Longest-prefix match: highlight the most specific nav item
            // whose href matches the start of the current pathname
            const isActive =
              pathname === item.href ||
              (pathname.startsWith(item.href + "/") &&
                !items.some(
                  (other) =>
                    other !== item &&
                    other.href.length > item.href.length &&
                    (pathname === other.href ||
                      pathname.startsWith(other.href + "/")),
                ));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-[13.5px] font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-forest text-white shadow-[0_10px_22px_rgba(81,34,74,0.28)]"
                      : "text-stone-500 hover:bg-stone-50 hover:text-stone-800"
                  }`}
                >
                  <span className={`text-base ${isActive ? "text-forest-light" : ""}`}>{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User info */}
      <div className="border-t border-stone-100 px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-sm font-medium text-stone-600">
            {userName
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-800">
              {userName}
            </p>
            <p className="truncate text-xs text-stone-400">View profile</p>
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}
