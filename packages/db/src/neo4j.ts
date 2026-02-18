import neo4j, { type Driver, type Session } from "neo4j-driver";

let driver: Driver | null = null;
let initPromise: Promise<Driver> | null = null;

/**
 * Initialize the Neo4j driver. Call once at startup.
 * Thread-safe: concurrent calls return the same driver instance.
 */
export function initNeo4j(
  uri?: string,
  username?: string,
  password?: string,
): Driver {
  if (driver) return driver;
  const u = uri ?? process.env.NEO4J_URI ?? "bolt://localhost:7687";
  const user = username ?? process.env.NEO4J_USERNAME ?? "neo4j";
  const pass = password ?? process.env.NEO4J_PASSWORD;
  if (!pass) {
    throw new Error("NEO4J_PASSWORD environment variable is required");
  }
  driver = neo4j.driver(u, neo4j.auth.basic(user, pass));
  return driver;
}

export function getNeo4jDriver(): Driver {
  if (driver) return driver;
  // Prevent race condition: only one call creates the driver
  driver = initNeo4j();
  return driver;
}

export async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Get a session scoped to an org's database (Neo4j 4+ multi-database).
 * Falls back to default database if dbName is not provided.
 */
export function getOrgSession(orgId?: string): Session {
  const d = getNeo4jDriver();
  return d.session({ database: orgId ?? "neo4j" });
}

// ── Graph operations ──────────────────────────────────

export interface Neo4jRelationship {
  fromUserId: string;
  toUserId: string;
  type: "WORKS_WITH" | "REPORTS_TO" | "MEMBER_OF";
  properties: Record<string, unknown>;
}

/**
 * Sync a reporting relationship to Neo4j.
 * Creates or updates REPORTS_TO edge between two users.
 */
export async function syncReportsTo(
  orgId: string,
  userId: string,
  managerId: string,
): Promise<void> {
  try {
    const session = getOrgSession(orgId);
    try {
      await session.run(
        `MERGE (u:User {id: $userId})
         MERGE (m:User {id: $managerId})
         MERGE (u)-[r:REPORTS_TO]->(m)
         SET r.updatedAt = datetime()`,
        { userId, managerId },
      );
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error("[Neo4j] syncReportsTo failed:", err);
  }
}

/**
 * Remove a REPORTS_TO relationship.
 */
export async function removeReportsTo(
  orgId: string,
  userId: string,
  managerId: string,
): Promise<void> {
  try {
    const session = getOrgSession(orgId);
    try {
      await session.run(
        `MATCH (u:User {id: $userId})-[r:REPORTS_TO]->(m:User {id: $managerId})
         DELETE r`,
        { userId, managerId },
      );
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error("[Neo4j] removeReportsTo failed:", err);
  }
}

/**
 * Sync a thread (WORKS_WITH) relationship to Neo4j.
 * Mirrors the user_relationships table row.
 */
export async function syncThread(
  orgId: string,
  fromUserId: string,
  toUserId: string,
  properties: {
    strength: number;
    source: string;
    label: string;
    tags: string[];
    relationshipId: string;
  },
): Promise<void> {
  try {
    const session = getOrgSession(orgId);
    try {
      await session.run(
        `MERGE (a:User {id: $from})
         MERGE (b:User {id: $to})
         MERGE (a)-[r:WORKS_WITH {relationshipId: $relId}]->(b)
         SET r.strength = $strength,
             r.source = $source,
             r.label = $label,
             r.tags = $tags,
             r.updatedAt = datetime()`,
        {
          from: fromUserId,
          to: toUserId,
          relId: properties.relationshipId,
          strength: properties.strength,
          source: properties.source,
          label: properties.label,
          tags: properties.tags,
        },
      );
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error("[Neo4j] syncThread failed:", err);
  }
}

/**
 * Remove a WORKS_WITH relationship by its PostgreSQL ID.
 */
export async function removeThread(
  orgId: string,
  relationshipId: string,
): Promise<void> {
  try {
    const session = getOrgSession(orgId);
    try {
      await session.run(
        `MATCH ()-[r:WORKS_WITH {relationshipId: $relId}]-()
         DELETE r`,
        { relId: relationshipId },
      );
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error("[Neo4j] removeThread failed:", err);
  }
}

/**
 * Sync a user node to Neo4j (upsert).
 */
export async function syncUserNode(
  orgId: string,
  user: { id: string; name: string; role: string; teamId: string | null },
): Promise<void> {
  try {
    const session = getOrgSession(orgId);
    try {
      await session.run(
        `MERGE (u:User {id: $id})
         SET u.name = $name, u.role = $role, u.teamId = $teamId, u.updatedAt = datetime()`,
        { id: user.id, name: user.name, role: user.role, teamId: user.teamId },
      );
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error("[Neo4j] syncUserNode failed:", err);
  }
}

/**
 * Get the full relationship web for a user (2-hop neighborhood).
 * Returns connected users and the edges between them.
 */
export async function getRelationshipWeb(
  orgId: string,
  userId: string,
): Promise<{
  nodes: Array<{ id: string; name: string; role: string; teamId: string | null }>;
  edges: Array<{
    from: string;
    to: string;
    type: string;
    strength: number;
    source: string;
    label: string;
  }>;
}> {
  try {
  const session = getOrgSession(orgId);
  try {
    const result = await session.run(
      `MATCH (center:User {id: $userId})
       OPTIONAL MATCH (center)-[r1]-(neighbor:User)
       OPTIONAL MATCH (neighbor)-[r2]-(hop2:User)
       WHERE hop2.id <> $userId
       WITH center, collect(DISTINCT neighbor) AS neighbors,
            collect(DISTINCT hop2) AS hop2s,
            collect(DISTINCT r1) AS rels1,
            collect(DISTINCT r2) AS rels2
       RETURN center, neighbors, hop2s, rels1, rels2`,
      { userId },
    );

    if (!result.records.length) return { nodes: [], edges: [] };

    const record = result.records[0];

    // Build a map from Neo4j internal node ID → user UUID
    // so we can resolve relationship start/end to actual user IDs
    type RawNode = { identity: { low: number }; elementId?: string; properties: Record<string, unknown> };
    const centerNode = record.get("center") as RawNode | null;
    if (!centerNode?.properties?.id) return { nodes: [], edges: [] };
    const neighborNodes = (record.get("neighbors") ?? []) as RawNode[];
    const hop2Nodes = (record.get("hop2s") ?? []) as RawNode[];

    // Map internal node IDs to user UUIDs (prefer elementId, fall back to identity.low)
    const internalIdToUuid = new Map<string, string>();
    const allNodes = [centerNode, ...neighborNodes, ...hop2Nodes];
    allNodes.forEach((n) => {
      if (!n?.properties?.id) return;
      const nodeKey = n.elementId ?? String(n.identity?.low ?? "");
      if (nodeKey) {
        internalIdToUuid.set(nodeKey, n.properties.id as string);
      }
    });

    const nodeMap = new Map<string, { id: string; name: string; role: string; teamId: string | null }>();
    allNodes.forEach((n) => {
      if (!n?.properties?.id) return;
      const p = n.properties;
      nodeMap.set(p.id as string, {
        id: p.id as string,
        name: (p.name as string) ?? "",
        role: (p.role as string) ?? "",
        teamId: (p.teamId as string | null) ?? null,
      });
    });

    const edges: Array<{
      from: string;
      to: string;
      type: string;
      strength: number;
      source: string;
      label: string;
    }> = [];

    const allRels = [...(record.get("rels1") ?? []), ...(record.get("rels2") ?? [])];
    const seenEdges = new Set<string>();
    allRels.forEach((r: {
      type: string;
      start: { low: number };
      startNodeElementId?: string;
      end: { low: number };
      endNodeElementId?: string;
      properties: Record<string, unknown>;
    }) => {
      // Resolve Neo4j internal IDs to user UUIDs (prefer elementId, fall back to identity.low)
      const startKey = r.startNodeElementId ?? String(r.start?.low ?? "");
      const endKey = r.endNodeElementId ?? String(r.end?.low ?? "");
      const fromUuid = internalIdToUuid.get(startKey);
      const toUuid = internalIdToUuid.get(endKey);
      if (!fromUuid || !toUuid) return; // Skip edges with unresolvable nodes

      const key = `${fromUuid}-${r.type}-${toUuid}`;
      if (seenEdges.has(key)) return;
      seenEdges.add(key);

      edges.push({
        from: fromUuid,
        to: toUuid,
        type: r.type,
        strength: (r.properties.strength as number) ?? 1,
        source: (r.properties.source as string) ?? "manual",
        label: (r.properties.label as string) ?? "",
      });
    });

    return { nodes: Array.from(nodeMap.values()), edges };
  } finally {
    await session.close();
  }
  } catch (err) {
    console.error("[Neo4j] getRelationshipWeb failed:", err);
    return { nodes: [], edges: [] };
  }
}
