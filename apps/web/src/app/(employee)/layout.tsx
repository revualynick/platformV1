export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <nav className="w-64 border-r border-gray-200 bg-white p-6">
        <h2 className="mb-6 text-lg font-semibold text-blue-600">Revualy</h2>
        <ul className="space-y-2">
          <li>
            <a
              href="/dashboard"
              className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
            >
              Dashboard
            </a>
          </li>
          <li>
            <a
              href="/dashboard"
              className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
            >
              My Feedback
            </a>
          </li>
          <li>
            <a
              href="/dashboard"
              className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
            >
              Engagement
            </a>
          </li>
          <li>
            <a
              href="/dashboard"
              className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
            >
              Kudos
            </a>
          </li>
        </ul>
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
