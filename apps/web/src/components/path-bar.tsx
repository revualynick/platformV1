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
              {i > 0 && <span className="text-stone-300 mx-0.5">/</span>}
              {isLast ? (
                <span className="font-semibold text-stone-800">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-stone-400 underline decoration-forest-light/40 underline-offset-2 transition-colors hover:text-forest hover:decoration-forest-light"
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
