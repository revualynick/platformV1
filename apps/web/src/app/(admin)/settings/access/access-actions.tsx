"use client";

import { useState, useTransition } from "react";
import { changeUserRole, deactivateUserAction, reactivateUserAction } from "../actions";

type Role = "employee" | "manager" | "admin" | "super_admin";

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  employee: "Employee",
};

const ROLE_HIERARCHY: Record<string, number> = {
  employee: 0,
  manager: 1,
  admin: 2,
  super_admin: 3,
};

interface ChangeRoleDialogProps {
  user: { id: string; name: string; email: string; role: string };
  currentUserRole: string;
  currentUserId: string;
}

export function ChangeRoleDialog({ user, currentUserRole, currentUserId }: ChangeRoleDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>(user.role);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isSelf = user.id === currentUserId;
  const callerLevel = ROLE_HIERARCHY[currentUserRole] ?? 0;
  const isSuperAdmin = currentUserRole === "super_admin";

  // Determine which roles this caller can assign
  const assignableRoles: Role[] = isSuperAdmin
    ? ["employee", "manager", "admin", "super_admin"]
    : ["employee", "manager"]; // admins can only toggle between employee/manager

  // Can't change own role, can't modify users at same or higher level (unless super_admin)
  const targetLevel = ROLE_HIERARCHY[user.role] ?? 0;
  const canModify = !isSelf && (isSuperAdmin || targetLevel < callerLevel);

  function handleSubmit() {
    if (!selectedRole || selectedRole === user.role) return;
    setError(null);
    const formData = new FormData();
    formData.set("userId", user.id);
    formData.set("role", selectedRole);
    startTransition(async () => {
      const result = await changeUserRole(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  if (!canModify) return null;

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); setSelectedRole(user.role); }}
        className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-700"
      >
        Change Role
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-stone-900">
                Change Role
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-stone-50 px-4 py-3">
              <p className="text-sm font-medium text-stone-800">{user.name}</p>
              <p className="text-xs text-stone-500">{user.email}</p>
            </div>

            <div className="mb-4 space-y-2">
              {assignableRoles.map((role) => (
                <label
                  key={role}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    selectedRole === role
                      ? "border-forest bg-forest/[0.04]"
                      : "border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    checked={selectedRole === role}
                    onChange={() => setSelectedRole(role)}
                    className="accent-forest"
                  />
                  <div>
                    <p className="text-sm font-medium text-stone-800">{roleLabels[role]}</p>
                    <p className="text-xs text-stone-400">
                      {role === "super_admin" && "Full system access, can manage all roles"}
                      {role === "admin" && "Organization settings, can manage managers/employees"}
                      {role === "manager" && "Team management, 1:1s, feedback oversight"}
                      {role === "employee" && "Standard access, feedback participation"}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {(selectedRole === "admin" || selectedRole === "super_admin") && selectedRole !== user.role && (
              <div className="mb-4 rounded-xl bg-terracotta/[0.06] px-4 py-3 text-xs text-terracotta">
                This will grant elevated privileges. Make sure this is intentional.
              </div>
            )}

            {error && (
              <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending || selectedRole === user.role}
                className="flex-1 rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-light disabled:opacity-60"
              >
                {isPending ? "Saving..." : "Update Role"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Deactivate Button ───────────────────────────────────

interface DeactivateButtonProps {
  userId: string;
  isActive: boolean;
  isSelf: boolean;
}

export function DeactivateButton({ userId, isActive, isSelf }: DeactivateButtonProps) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (isSelf) return null;

  function handleConfirm() {
    setError(null);
    const formData = new FormData();
    formData.set("userId", userId);
    startTransition(async () => {
      const result = isActive
        ? await deactivateUserAction(formData)
        : await reactivateUserAction(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setConfirm(false);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => { setConfirm(true); setError(null); }}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
          isActive
            ? "text-terracotta hover:bg-terracotta/10"
            : "text-forest hover:bg-forest/10"
        }`}
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </button>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 font-display text-lg font-semibold text-stone-900">
              {isActive ? "Deactivate user?" : "Reactivate user?"}
            </h2>
            <p className="mb-5 text-sm text-stone-500">
              {isActive
                ? "This user will no longer be able to access the platform."
                : "This user will regain access to the platform."}
            </p>

            {error && (
              <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                  isActive ? "bg-terracotta hover:bg-terracotta/90" : "bg-forest hover:bg-forest-light"
                }`}
              >
                {isPending ? "Saving..." : isActive ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
