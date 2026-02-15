import type { UUID, ISODateTime } from "./common.js";

export type RelationshipSource = "manual" | "calendar" | "chat";

export interface UserRelationship {
  id: UUID;
  fromUserId: UUID;
  toUserId: UUID;
  label: string;
  tags: string[];
  strength: number; // 0–1
  source: RelationshipSource;
  notes: string | null;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Graph node for D3/frontend visualization */
export interface RelationshipGraphNode {
  id: UUID;
  name: string;
  role: string;
  team: string | null;
  managerId: UUID | null;
}

/** Graph edge — includes both reporting lines and threads */
export interface RelationshipGraphEdge {
  id: UUID;
  from: UUID;
  to: UUID;
  type: "reports_to" | "thread";
  label: string;
  tags: string[];
  strength: number;
  source: RelationshipSource;
}

export interface RelationshipGraph {
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
}
