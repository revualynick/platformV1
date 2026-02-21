"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

const PathNameContext = createContext<Record<string, string>>({});

/**
 * Provide display names for dynamic URL segments (e.g. UUIDs → human names).
 * Nesting merges — a layout provider and a page provider both contribute.
 */
export function PathNameProvider({
  names,
  children,
}: {
  names: Record<string, string>;
  children: ReactNode;
}) {
  const parent = useContext(PathNameContext);
  const merged = useMemo(() => ({ ...parent, ...names }), [parent, names]);

  return (
    <PathNameContext.Provider value={merged}>
      {children}
    </PathNameContext.Provider>
  );
}

/** Read the merged map of dynamic segment → display name. */
export function usePathNames(): Record<string, string> {
  return useContext(PathNameContext);
}
