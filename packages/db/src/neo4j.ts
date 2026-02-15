import neo4j, { type Driver, type Session } from "neo4j-driver";

let driver: Driver | null = null;

/**
 * Initialize the Neo4j driver. Call once at startup.
 */
export function initNeo4j(
  uri?: string,
  username?: string,
  password?: string,
): Driver {
  const u = uri ?? process.env.NEO4J_URI ?? "bolt://localhost:7687";
  const user = username ?? process.env.NEO4J_USERNAME ?? "neo4j";
  const pass = password ?? process.env.NEO4J_PASSWORD ?? "revualy";
  driver = neo4j.driver(u, neo4j.auth.basic(user, pass));
  return driver;
}

export function getNeo4jDriver(): Driver {
  if (!driver) {
    driver = initNeo4j();
  }
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
}

/**
 * Remove a REPORTS_TO relationship.
 */
export async function removeReportsTo(
  orgId: string,
  userId: string,
  managerId: string,
): Promise<void> {
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
}

/**
 * Remove a WORKS_WITH relationship by its PostgreSQL ID.
 */
export async function removeThread(
  orgId: string,
  relationshipId: string,
): Promise<void> {
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
}

/**
 * Sync a user node to Neo4j (upsert).
 */
export async function syncUserNode(
  orgId: string,
  user: { id: string; name: string; role: string; teamId: string | null },
): Promise<void> {
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
    const center = record.get("center").properties;
    const neighbors = (record.get("neighbors") ?? []).map(
      (n: { properties: Record<string, unknown> }) => n.properties,
    );
    const hop2s = (record.get("hop2s") ?? []).map(
      (n: { properties: Record<string, unknown> }) => n.properties,
    );

    const nodeMap = new Map<string, { id: string; name: string; role: string; teamId: string | null }>();
    [center, ...neighbors, ...hop2s].forEach((n) => {
      nodeMap.set(n.id as string, {
        id: n.id as string,
        name: (n.name as string) ?? "",
        role: (n.role as string) ?? "",
        teamId: (n.teamId as string | null) ?? null,
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
      end: { low: number };
      properties: Record<string, unknown>;
    }) => {
      const key = `${r.start.low}-${r.type}-${r.end.low}`;
      if (seenEdges.has(key)) return;
      seenEdges.add(key);
      edges.push({
        from: (r.properties.fromUserId ?? r.start.low.toString()) as string,
        to: (r.properties.toUserId ?? r.end.low.toString()) as string,
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
}
