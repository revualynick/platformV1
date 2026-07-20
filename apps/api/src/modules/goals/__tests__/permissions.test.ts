import { describe, it, expect } from "vitest";
import {
  canViewGoal,
  canManageGoal,
  canCreateGoal,
  type GoalPermissionContext,
  type GoalForPermissions,
  type Role,
} from "../permissions.js";

const ALICE = "alice"; // employee
const BOB = "bob"; // Alice's manager, owns team-1
const CARA = "cara"; // admin, manages no one
const DANA = "dana"; // another employee, different chain

function ctx(overrides: Partial<GoalPermissionContext> = {}): GoalPermissionContext {
  return {
    userId: ALICE,
    role: "employee",
    ownedTeamIds: new Set(),
    reportingTree: new Set([overrides.userId ?? ALICE]),
    ...overrides,
  };
}

const employeeCtx = ctx();
const managerCtx = ctx({
  userId: BOB,
  role: "manager",
  ownedTeamIds: new Set(["team-1"]),
  reportingTree: new Set([BOB, ALICE]),
});
const adminCtx = ctx({ userId: CARA, role: "admin", reportingTree: new Set([CARA]) });
const otherEmployeeCtx = ctx({ userId: DANA, reportingTree: new Set([DANA]) });

function goal(overrides: Partial<GoalForPermissions> = {}): GoalForPermissions {
  return {
    level: "individual",
    ownerId: ALICE,
    teamId: null,
    shareWithManager: false,
    ...overrides,
  };
}

const orgGoal = goal({ level: "org", ownerId: CARA });
const teamGoal = goal({ level: "team", ownerId: BOB, teamId: "team-1" });
const otherTeamGoal = goal({ level: "team", ownerId: DANA, teamId: "team-2" });
const alicesIndividualGoal = goal({ level: "individual", teamId: "team-1" });
const alicesPersonalGoal = goal({ level: "personal" });
const alicesSharedPersonalGoal = goal({ level: "personal", shareWithManager: true });

describe("canViewGoal", () => {
  it("lets everyone view org, team, and individual goals", () => {
    for (const c of [employeeCtx, managerCtx, adminCtx, otherEmployeeCtx]) {
      expect(canViewGoal(c, orgGoal)).toBe(true);
      expect(canViewGoal(c, teamGoal)).toBe(true);
      expect(canViewGoal(c, alicesIndividualGoal)).toBe(true);
    }
  });

  it("lets only the owner view an unshared personal goal", () => {
    expect(canViewGoal(employeeCtx, alicesPersonalGoal)).toBe(true);
    expect(canViewGoal(managerCtx, alicesPersonalGoal)).toBe(false);
    expect(canViewGoal(otherEmployeeCtx, alicesPersonalGoal)).toBe(false);
  });

  it("does NOT let admins bypass personal-goal privacy", () => {
    expect(canViewGoal(adminCtx, alicesPersonalGoal)).toBe(false);
    expect(canViewGoal(adminCtx, alicesSharedPersonalGoal)).toBe(false);
  });

  it("lets the management chain view a shared personal goal", () => {
    expect(canViewGoal(managerCtx, alicesSharedPersonalGoal)).toBe(true);
  });

  it("does not let unrelated employees view a shared personal goal", () => {
    expect(canViewGoal(otherEmployeeCtx, alicesSharedPersonalGoal)).toBe(false);
  });
});

describe("canManageGoal", () => {
  it("org goals: admin and super_admin only", () => {
    expect(canManageGoal(adminCtx, orgGoal)).toBe(true);
    expect(canManageGoal(ctx({ userId: "s", role: "super_admin", reportingTree: new Set(["s"]) }), orgGoal)).toBe(true);
    expect(canManageGoal(managerCtx, orgGoal)).toBe(false);
    expect(canManageGoal(employeeCtx, orgGoal)).toBe(false);
  });

  it("team goals: owning manager or admin", () => {
    expect(canManageGoal(managerCtx, teamGoal)).toBe(true);
    expect(canManageGoal(adminCtx, teamGoal)).toBe(true);
    expect(canManageGoal(managerCtx, otherTeamGoal)).toBe(false);
    expect(canManageGoal(employeeCtx, teamGoal)).toBe(false);
  });

  it("team goals with no teamId are admin-only", () => {
    const orphanTeamGoal = goal({ level: "team", teamId: null });
    expect(canManageGoal(managerCtx, orphanTeamGoal)).toBe(false);
    expect(canManageGoal(adminCtx, orphanTeamGoal)).toBe(true);
  });

  it("individual goals: owner, manager in chain, or admin", () => {
    expect(canManageGoal(employeeCtx, alicesIndividualGoal)).toBe(true);
    expect(canManageGoal(managerCtx, alicesIndividualGoal)).toBe(true);
    expect(canManageGoal(adminCtx, alicesIndividualGoal)).toBe(true);
    expect(canManageGoal(otherEmployeeCtx, alicesIndividualGoal)).toBe(false);
  });

  it("personal goals: owner only — not manager, not admin", () => {
    expect(canManageGoal(employeeCtx, alicesPersonalGoal)).toBe(true);
    expect(canManageGoal(managerCtx, alicesPersonalGoal)).toBe(false);
    expect(canManageGoal(managerCtx, alicesSharedPersonalGoal)).toBe(false);
    expect(canManageGoal(adminCtx, alicesPersonalGoal)).toBe(false);
  });
});

describe("canCreateGoal", () => {
  it("employees can create their own individual and personal goals", () => {
    expect(canCreateGoal(employeeCtx, alicesIndividualGoal)).toBe(true);
    expect(canCreateGoal(employeeCtx, alicesPersonalGoal)).toBe(true);
  });

  it("employees cannot create org or team goals", () => {
    expect(canCreateGoal(employeeCtx, goal({ level: "org" }))).toBe(false);
    expect(canCreateGoal(employeeCtx, goal({ level: "team", teamId: "team-1" }))).toBe(false);
  });

  it("managers can create team goals for their team and individual goals for reports", () => {
    expect(canCreateGoal(managerCtx, teamGoal)).toBe(true);
    expect(canCreateGoal(managerCtx, otherTeamGoal)).toBe(false);
    expect(canCreateGoal(managerCtx, alicesIndividualGoal)).toBe(true);
  });

  it("admins can create org goals", () => {
    expect(canCreateGoal(adminCtx, orgGoal)).toBe(true);
  });

  it("nobody can create a personal goal for someone else", () => {
    expect(canCreateGoal(managerCtx, alicesPersonalGoal)).toBe(false);
    expect(canCreateGoal(adminCtx, alicesPersonalGoal)).toBe(false);
    const bobsOwnPersonal = goal({ level: "personal", ownerId: BOB });
    expect(canCreateGoal(managerCtx, bobsOwnPersonal)).toBe(true);
  });
});
