import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { getUsers } from "@/lib/api";
import type { UserRow } from "@/lib/api";
import PeopleChart from "./people-chart";
import { AddPersonDialog, ImportPeopleDialog, DeactivateButton } from "./people-actions";

async function loadUsers(isDemo: boolean): Promise<UserRow[]> {
  if (isDemo) return [];
  try {
    const { data } = await getUsers();
    return data;
  } catch {
    return [];
  }
}

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

export default async function PeoplePage() {
  const session = await auth();
  const isDemo = isDemoSession(session);
  const users = await loadUsers(isDemo);
  const currentUserId = session?.user?.id ?? "";
  const currentUserRole = (session as { role?: string })?.role ?? "employee";

  return (
    <div className="max-w-[1200px]">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm font-medium text-stone-400">Organization</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          People & Structure
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
          Manage team members, roles, and reporting lines. Add individuals or import
          in bulk via CSV.
        </p>
      </div>

      {/* Actions */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <AddPersonDialog currentUserRole={currentUserRole} />
        <ImportPeopleDialog />
      </div>

      {/* People table */}
      <div className="mb-8 rounded-2xl border border-stone-200/80 bg-white shadow-sm">
        {users.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-stone-500">No people added yet</p>
            <p className="mt-1 text-xs text-stone-400">
              Add individuals or import from CSV to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="px-6 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-400">
                    Name
                  </th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-400">
                    Email
                  </th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-400">
                    Role
                  </th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-400">
                    Timezone
                  </th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-medium uppercase tracking-wider text-stone-400">
                    Status
                  </th>
                  <th className="px-6 py-3.5 text-right text-[11px] font-medium uppercase tracking-wider text-stone-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {users.map((user) => {
                  const initials = user.name
                    ? user.name.split(" ").map((n) => n[0] ?? "").filter(Boolean).slice(0, 2).join("") || user.email[0]?.toUpperCase() || "?"
                    : "?";
                  return (
                    <tr
                      key={user.id}
                      className="transition-colors hover:bg-stone-50/60"
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest/10 text-[11px] font-semibold text-forest">
                            {initials}
                          </div>
                          <span className="font-medium text-stone-800">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-stone-500">{user.email}</td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${roleBadgeStyles[user.role] ?? roleBadgeStyles.employee}`}
                        >
                          {roleLabels[user.role] ?? user.role}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-stone-400 text-xs">
                        {user.timezone}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                            user.isActive
                              ? "bg-forest/10 text-forest"
                              : "bg-stone-100 text-stone-400"
                          }`}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <DeactivateButton
                          userId={user.id}
                          isActive={user.isActive}
                          isSelf={user.id === currentUserId}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Org chart (demo / visual reference) */}
      {isDemo && (
        <div>
          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
              Interactive Org Chart (Demo)
            </p>
          </div>
          <PeopleChart />
        </div>
      )}
    </div>
  );
}
