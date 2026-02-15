import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="mb-4 text-4xl font-bold">Revualy</h1>
      <p className="mb-8 text-lg text-gray-600">
        AI-powered peer review platform
      </p>
      <div className="flex gap-4">
        <Link
          href="/dashboard"
          className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
        >
          Employee Dashboard
        </Link>
        <Link
          href="/team"
          className="rounded-lg bg-green-600 px-6 py-3 text-white hover:bg-green-700"
        >
          Manager Dashboard
        </Link>
        <Link
          href="/settings"
          className="rounded-lg bg-purple-600 px-6 py-3 text-white hover:bg-purple-700"
        >
          Admin Dashboard
        </Link>
      </div>
    </main>
  );
}
