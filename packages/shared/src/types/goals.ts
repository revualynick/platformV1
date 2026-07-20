import type { UUID, ISODateTime } from "./common.js";

export type GoalLevel = "org" | "team" | "individual" | "personal";

export type GoalStatus =
  | "draft"
  | "on_track"
  | "at_risk"
  | "behind"
  | "achieved"
  | "archived";

export type GoalUpdateSource = "dashboard" | "chat" | "meet_transcript";

export interface GoalCycleDto {
  id: UUID;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  createdAt: ISODateTime;
}

export interface GoalDto {
  id: UUID;
  level: GoalLevel;
  title: string;
  description: string;
  parentGoalId: UUID | null;
  cycleId: UUID | null;
  teamId: UUID | null;
  ownerId: UUID;
  createdById: UUID;
  status: GoalStatus;
  progressPercent: number;
  metricName: string | null;
  metricStartValue: number | null;
  metricTargetValue: number | null;
  metricCurrentValue: number | null;
  shareWithManager: boolean;
  targetDate: string | null; // YYYY-MM-DD
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface GoalUpdateDto {
  id: UUID;
  goalId: UUID;
  authorId: UUID;
  progressPercent: number | null;
  metricCurrentValue: number | null;
  status: GoalStatus | null;
  note: string;
  source: GoalUpdateSource;
  createdAt: ISODateTime;
}

/** A goal in the alignment ladder: own progress plus the informational
 * aggregate of its children (never overwrites the goal's own progress). */
export interface GoalLadderNode {
  goal: GoalDto;
  ownerName: string;
  effectiveProgress: number;
  alignmentPercent: number | null;
  children: GoalLadderNode[];
}
