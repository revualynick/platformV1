import { integrations } from "@/lib/mock-data";

const statusStyles = {
  connected: { text: "text-positive", label: "Connected", dot: "bg-positive" },
  disconnected: {
    text: "text-stone-400",
    label: "Not connected",
    dot: "bg-stone-300",
  },
};

const platformIcons: Record<string, string> = {
  slack: "💬",
  google_chat: "🟢",
  teams: "🟣",
  google_calendar: "📅",
};

const platformDescriptions: Record<string, string> = {
  slack:
    "Send and receive feedback interactions via Slack DMs. Supports Block Kit rich messages, slash commands, and interactive components.",
  google_chat:
    "Integrate with Google Chat spaces and DMs. Uses Cards v2 for rich formatting and Pub/Sub for real-time events.",
  teams:
    "Connect to Microsoft Teams channels and chats. Uses Adaptive Cards for interactive feedback flows.",
  google_calendar:
    "Sync calendar events to automatically build relationship graphs and find optimal interaction times.",
};

export default function IntegrationsPage() {
  const connected = integrations.filter((i) => i.status === "connected").length;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Configuration</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Integrations
        </h1>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {[
          {
            label: "Connected",
            value: connected.toString(),
            sub: `of ${integrations.length} available`,
            color: "text-forest",
          },
          {
            label: "Chat Platforms",
            value: integrations
              .filter(
                (i) =>
                  i.platform !== "google_calendar" &&
                  i.status === "connected",
              )
              .length.toString(),
            sub: "For feedback delivery",
            color: "text-stone-900",
          },
          {
            label: "Data Sources",
            value: integrations
              .filter(
                (i) =>
                  i.platform === "google_calendar" &&
                  i.status === "connected",
              )
              .length.toString(),
            sub: "Calendar & comms",
            color: "text-stone-900",
          },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-5"
            style={{
              animationDelay: `${i * 80}ms`,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
              {stat.label}
            </span>
            <p
              className={`mt-1 font-display text-2xl font-semibold ${stat.color}`}
            >
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-stone-400">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Integration cards */}
      <div className="space-y-4">
        {integrations.map((integration, i) => {
          const status = statusStyles[integration.status];
          const isConnected = integration.status === "connected";
          return (
            <div
              key={integration.id}
              className={`card-enter rounded-2xl border bg-white p-6 transition-all ${
                isConnected
                  ? "border-stone-200/60 hover:border-stone-300/60 hover:shadow-md"
                  : "border-dashed border-stone-200"
              }`}
              style={{
                animationDelay: `${300 + i * 80}ms`,
                boxShadow: isConnected ? "var(--shadow-sm)" : undefined,
              }}
            >
              <div className="flex items-start gap-5">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-stone-50 text-2xl">
                  {platformIcons[integration.platform] ?? "🔗"}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-display text-base font-semibold text-stone-800">
                      {integration.name}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
                      />
                      <span className={`text-xs ${status.text}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
                    {platformDescriptions[integration.platform]}
                  </p>
                  {integration.workspace && (
                    <p className="mt-2 text-xs text-stone-400">
                      Workspace:{" "}
                      <span className="font-medium text-stone-600">
                        {integration.workspace}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    className={`rounded-xl px-5 py-2.5 text-xs font-medium transition-colors ${
                      isConnected
                        ? "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                        : "bg-forest text-white hover:bg-forest-light"
                    }`}
                  >
                    {isConnected ? "Configure" : "Connect"}
                  </button>
                  {isConnected && (
                    <button className="text-[11px] text-stone-400 hover:text-danger">
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
