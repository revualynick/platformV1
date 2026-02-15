export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <nav className="w-64 border-r border-gray-200 bg-white p-6">
        <h2 className="mb-6 text-lg font-semibold text-green-600">
          Revualy <span className="text-xs text-gray-400">Manager</span>
        </h2>
        <ul className="space-y-2">
          <li>
            <a
              href="/team"
              className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
            >
              Team Overview
            </a>
          </li>
          <li>
            <a
              href="/team"
              className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
            >
              Team Feedback
            </a>
          </li>
          <li>
            <a
              href="/team"
              className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
            >
              Flagged Items
            </a>
          </li>
          <li>
            <a
              href="/team"
              className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
            >
              Leaderboard
            </a>
          </li>
        </ul>
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
