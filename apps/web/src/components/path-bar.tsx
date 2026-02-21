"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePathNames } from "@/lib/path-context";
import { buildBreadcrumbs } from "@/lib/route-config";

export function PathBar() {
  const pathname = usePathname();
  const nameOverrides = usePathNames();
  const crumbs = buildBreadcrumbs(pathname, nameOverrides);

  // Hide on root-level pages (single segment like /dashboard, /team, /settings)
  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-[13px]">
      <ol className="flex items-center gap-1.5">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-stone-300">/</span>}
              {isLast ? (
                <span className="font-medium text-stone-700">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-stone-400 transition-colors hover:text-forest"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
