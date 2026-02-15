import type { UUID, ISODateTime } from "./common.js";

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  dbConnectionString: string;
  region: string;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Team {
  id: UUID;
  orgId: UUID;
  name: string;
  managerId: UUID | null;
  parentTeamId: UUID | null;
  createdAt: ISODateTime;
}

export interface CoreValue {
  id: UUID;
  orgId: UUID;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: ISODateTime;
}
