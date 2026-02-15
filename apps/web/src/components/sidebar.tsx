"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-[260px] flex-col border-r border-stone-200/80 bg-white/80 backdrop-blur-sm">
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
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-[13.5px] font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-forest/[0.07] text-forest"
                      : "text-stone-500 hover:bg-stone-50 hover:text-stone-800"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                  {isActive && (
                    <div className="ml-auto h-1.5 w-1.5 rounded-full bg-forest" />
                  )}
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
  );
}
