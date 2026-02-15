export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <nav className="w-64 border-r border-gray-200 bg-white p-6">
        <h2 className="mb-6 text-lg font-semibold text-purple-600">
          Revualy <span className="text-xs text-gray-400">Admin</span>
        </h2>
        <ul className="space-y-2">
          <li>
            <a
              href="/settings"
              className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
            >
              Organization
            </a>
          </li>
          <li>
            <a
              href="/settings"
              className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
            >
              Core Values
            </a>
          </li>
          <li>
            <a
              href="/settings"
              className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
            >
              Question Bank
            </a>
          </li>
          <li>
            <a
              href="/settings"
              className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
            >
              Integrations
            </a>
          </li>
          <li>
            <a
              href="/settings"
              className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
            >
              Escalations
            </a>
          </li>
        </ul>
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
