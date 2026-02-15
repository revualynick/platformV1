export default function TeamDashboard() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Team Overview</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">Team Members</h3>
          <p className="mt-2 text-3xl font-bold">--</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">
            Avg Engagement
          </h3>
          <p className="mt-2 text-3xl font-bold">--</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">Flagged Items</h3>
          <p className="mt-2 text-3xl font-bold">0</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500">
            Response Rate
          </h3>
          <p className="mt-2 text-3xl font-bold">--</p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-xl font-semibold">Team Feedback</h2>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-400">
          Team feedback will appear here once interactions begin.
        </div>
      </div>
    </div>
  );
}
