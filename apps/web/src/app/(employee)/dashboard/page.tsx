export default function EmployeeDashboard() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">My Dashboard</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">
            Engagement Score
          </h3>
          <p className="mt-2 text-3xl font-bold">--</p>
          <p className="mt-1 text-sm text-gray-400">This week</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">
            Interactions
          </h3>
          <p className="mt-2 text-3xl font-bold">0 / 3</p>
          <p className="mt-1 text-sm text-gray-400">Target this week</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">Streak</h3>
          <p className="mt-2 text-3xl font-bold">0</p>
          <p className="mt-1 text-sm text-gray-400">Consecutive weeks</p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-xl font-semibold">Recent Feedback</h2>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-400">
          No feedback yet. Your first interaction is coming soon!
        </div>
      </div>
    </div>
  );
}
