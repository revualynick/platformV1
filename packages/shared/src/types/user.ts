import type { UUID, ISODateTime, ChatPlatform, UserRole } from "./common.js";

export interface User {
  id: UUID;
  orgId: UUID;
  email: string;
  name: string;
  role: UserRole;
  teamId: UUID | null;
  managerId: UUID | null;
  timezone: string;
  isActive: boolean;
  onboardingCompleted: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface UserPlatformIdentity {
  id: UUID;
  userId: UUID;
  platform: ChatPlatform;
  platformUserId: string;
  platformWorkspaceId: string;
  displayName: string;
  createdAt: ISODateTime;
}

export interface UserPreferences {
  userId: UUID;
  preferredInteractionTime: string | null; // HH:mm format
  weeklyInteractionTarget: number; // default 2-3
  quietDays: number[]; // 0=Sunday, 6=Saturday
}
