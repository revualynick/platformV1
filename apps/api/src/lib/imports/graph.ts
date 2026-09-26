/**
 * Manager cycles (A reports to B reports to A) in a reports-to map. Each
 * node has at most one manager, so following the chain from any node
 * either ends or loops; every loop is reported once, as the list of nodes
 * in reporting order, starting from its smallest key so the output is
 * stable. A self-edge (A reports to A) is a cycle of one.
 */
export function findManagerCycles(managerOf: ReadonlyMap<string, string | null | undefined>): string[][] {
  const state = new Map<string, "visiting" | "done">();
  const cycles: string[][] = [];

  for (const start of managerOf.keys()) {
    if (state.has(start)) continue;
    const path: string[] = [];
    const onPath = new Map<string, number>();
    let node: string | null | undefined = start;
    while (node != null && !state.has(node)) {
      state.set(node, "visiting");
      onPath.set(node, path.length);
      path.push(node);
      node = managerOf.get(node);
    }
    if (node != null && state.get(node) === "visiting" && onPath.has(node)) {
      const loop = path.slice(onPath.get(node)!);
      const min = loop.reduce((a, b) => (b < a ? b : a));
      const at = loop.indexOf(min);
      cycles.push([...loop.slice(at), ...loop.slice(0, at)]);
    }
    for (const n of path) state.set(n, "done");
  }
  return cycles;
}
