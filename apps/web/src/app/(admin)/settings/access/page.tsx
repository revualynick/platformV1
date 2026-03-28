import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { getUsers } from "@/lib/api";
import type { UserRow } from "@/lib/api";
import { ChangeRoleDialog, DeactivateButton } from "./access-actions";

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  employee: "Employee",
};

const roleBadgeStyles: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700",
  admin: "bg-terracotta/10 text-terracotta",
  manager: "bg-forest/10 text-forest",
  employee: "bg-stone-100 text-stone-500",
};

const roleOrder: Record<string, number> = {
  super_admin: 0,
  admin: 1,
  manager: 2,
  employee: 3,
};

async function loadUsers(isDemo: boolean): Promise<UserRow[]> {
  if (isDemo) return [];
  try {
    const { data } = await getUsers();
    return data;
  } catch {
    return [];
  }
}

export default async function AccessPage() {
  const session = await auth();
  const isDemo = isDemoSession(session);
  const allUsers = await loadUsers(isDemo);

  const currentUserId = session?.user?.id ?? "";
  const currentUserRole = (session as { role?: string })?.role ?? "employee";

  // Show admins/managers at top, then employees
  const sorted = [...allUsers].sort(
    (a, b) => (roleOrder[a.role] ?? 4) - (roleOrder[b.role] ?? 4),
  );

  // Split into privileged (super_admin, admin, manager) and regular users
  const privileged = sorted.filter((u) =>
    ["super_admin", "admin", "manager"].includes(u.role),
  );
  const employees = sorted.filter((u) => u.role === "employee");

  return (
    <div className="max-w-[1000px]">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm font-medium text-stone-400">Administration</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Access Management
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
          Manage admin and manager roles. Only super admins can promote users to
          admin or super admin.
        </p>
      </div>

      {/* Current user badge */}
      <div className="mb-6 rounded-2xl border border-stone-200/60 bg-surface p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-forest text-sm font-semibold text-white">
            {(session?.user?.name ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-stone-800">
              {session?.user?.name ?? "You"}
            </p>
            <p className="text-xs text-stone-400">{session?.user?.email}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${roleBadgeStyles[currentUserRole] ?? roleBadgeStyles.employee}`}>
            {roleLabels[currentUserRole] ?? currentUserRole}
          </span>
        </div>
      </div>

      {/* Privileged users table */}
      <div className="mb-8">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-stone-400">
          Admins & Managers ({privileged.length})
        </h2>
        <div className="rounded-2xl border border-stone-200/80 bg-white shadow-sm">
          {privileged.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-stone-500">No admin or manager users yet.</p>
              <p className="mt-1 text-xs text-stone-400">
                Promote users from the People page or change roles below.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100">
                    <th className="px-6 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-400">Name</th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-400">Email</th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-400">Role</th>
                    <th className="px-6 py-3.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {privileged.map((user) => {
                    const initials = user.name.split(" ").map((n) => n[0]).slice(0, 2).join("");
                    const isSelf = user.id === currentUserId;
                    return (
                      <tr key={user.id} className="transition-colors hover:bg-stone-50/60">
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest/10 text-[11px] font-semibold text-forest">
                              {initials}
                            </div>
                            <span className="font-medium text-stone-800">
                              {user.name}
                              {isSelf && <span className="ml-1.5 text-xs text-stone-400">(you)</span>}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-stone-500">{user.email}</td>
                        <td className="px-6 py-3.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${roleBadgeStyles[user.role] ?? roleBadgeStyles.employee}`}>
                            {roleLabels[user.role] ?? user.role}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <ChangeRoleDialog
                              user={user}
                              currentUserRole={currentUserRole}
                              currentUserId={currentUserId}
                            />
                            <DeactivateButton
                              userId={user.id}
                              isActive={user.isActive}
                              isSelf={isSelf}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Employees section */}
      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-stone-400">
          Employees ({employees.length})
        </h2>
        <div className="rounded-2xl border border-stone-200/80 bg-white shadow-sm">
          {employees.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-stone-500">No employees yet.</p>
              <p className="mt-1 text-xs text-stone-400">
                Add people from the People settings page.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100">
                    <th className="px-6 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-400">Name</th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-400">Email</th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-400">Role</th>
                    <th className="px-6 py-3.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {employees.map((user) => {
                    const initials = user.name.split(" ").map((n) => n[0]).slice(0, 2).join("");
                    return (
                      <tr key={user.id} className="transition-colors hover:bg-stone-50/60">
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[11px] font-semibold text-stone-500">
                              {initials}
                            </div>
                            <span className="font-medium text-stone-800">{user.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-stone-500">{user.email}</td>
                        <td className="px-6 py-3.5">
                          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-500">
                            Employee
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <ChangeRoleDialog
                              user={user}
                              currentUserRole={currentUserRole}
                              currentUserId={currentUserId}
                            />
                            <DeactivateButton
                              userId={user.id}
                              isActive={user.isActive}
                              isSelf={user.id === currentUserId}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
