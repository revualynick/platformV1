export default function AdminSettings() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Organization Settings</h1>
      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Company Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600">
                Company Name
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                placeholder="Your Company"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600">
                Region
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                placeholder="us-east-1"
                disabled
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Core Values</h2>
          <p className="text-gray-400">
            Configure your company core values for feedback mapping.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Integrations</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-gray-200 p-4">
              <div>
                <p className="font-medium">Slack</p>
                <p className="text-sm text-gray-400">Not connected</p>
              </div>
              <button className="rounded-md bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200">
                Connect
              </button>
            </div>
            <div className="flex items-center justify-between rounded-md border border-gray-200 p-4">
              <div>
                <p className="font-medium">Google Chat</p>
                <p className="text-sm text-gray-400">Not connected</p>
              </div>
              <button className="rounded-md bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200">
                Connect
              </button>
            </div>
            <div className="flex items-center justify-between rounded-md border border-gray-200 p-4">
              <div>
                <p className="font-medium">Microsoft Teams</p>
                <p className="text-sm text-gray-400">Not connected</p>
              </div>
              <button className="rounded-md bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200">
                Connect
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
