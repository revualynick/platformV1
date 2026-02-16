import { auth } from "@/lib/auth";
import { getKudos, getOrgConfig, getUsers } from "@/lib/api";
import {
  kudosReceived as mockReceived,
  kudosGiven as mockGiven,
} from "@/lib/mock-data";
import { SendKudosModal } from "@/components/send-kudos-modal";

const valueColors: Record<string, string> = {
  Ownership: "bg-terracotta/10 text-terracotta",
  Excellence: "bg-forest/10 text-forest",
  Teamwork: "bg-sky-100 text-sky-700",
  Communication: "bg-violet-100 text-violet-700",
  Innovation: "bg-amber/10 text-warning",
};

type KudosItem = {
  id: string;
  from: string;
  to: string;
  date: string;
  message: string;
  value: string;
};

async function loadKudosData() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { received: mockReceived, given: mockGiven, users: [], values: [] };
  }

  try {
    const [kudosResult, orgResult, usersResult] = await Promise.allSettled([
      getKudos(userId),
      getOrgConfig(),
      getUsers(),
    ]);

    const valuesMap = new Map<string, string>();
    const valuesList: Array<{ id: string; name: string }> = [];
    if (orgResult.status === "fulfilled") {
      orgResult.value.coreValues.forEach((v) => {
        valuesMap.set(v.id, v.name);
        valuesList.push({ id: v.id, name: v.name });
      });
    }

    const usersList: Array<{ id: string; name: string }> = [];
    if (usersResult.status === "fulfilled") {
      usersResult.value.data
        .filter((u) => u.id !== userId && u.isActive)
        .forEach((u) => usersList.push({ id: u.id, name: u.name }));
    }

    if (kudosResult.status === "fulfilled" && kudosResult.value.data.length > 0) {
      const all = kudosResult.value.data;
      const received: KudosItem[] = all
        .filter((k) => k.receiverId === userId)
        .map((k) => ({
          id: k.id,
          from: k.giverName,
          to: "You",
          date: new Date(k.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          message: k.message,
          value: k.coreValueId ? (valuesMap.get(k.coreValueId) ?? "Recognition") : "Recognition",
        }));

      const given: KudosItem[] = all
        .filter((k) => k.giverId === userId)
        .map((k) => ({
          id: k.id,
          from: "You",
          to: k.receiverName,
          date: new Date(k.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          message: k.message,
          value: k.coreValueId ? (valuesMap.get(k.coreValueId) ?? "Recognition") : "Recognition",
        }));

      if (received.length > 0 || given.length > 0) {
        return { received, given, users: usersList, values: valuesList };
      }
    }

    return { received: mockReceived, given: mockGiven, users: usersList, values: valuesList };
  } catch {
    return { received: mockReceived, given: mockGiven, users: [], values: [] };
  }
}

export default async function KudosPage() {
  const { received, given, users, values } = await loadKudosData();

  // Determine top value from received kudos
  const valueCounts: Record<string, number> = {};
  received.forEach((k) => { valueCounts[k.value] = (valueCounts[k.value] || 0) + 1; });
  const topValue = Object.entries(valueCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Recognition</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Kudos
        </h1>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {[
          {
            label: "Received",
            value: received.length.toString(),
            sub: "From your peers",
            color: "text-forest",
          },
          {
            label: "Given",
            value: given.length.toString(),
            sub: "To your peers",
            color: "text-terracotta",
          },
          {
            label: "Top Value",
            value: topValue,
            sub: "Most recognized for",
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

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Received */}
        <div className="lg:col-span-7">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "200ms", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
              Received
            </h3>
            <div className="space-y-4">
              {received.map((kudo, i) => (
                <div
                  key={kudo.id}
                  className="card-enter group rounded-xl border border-stone-100 p-5 transition-colors hover:border-stone-200"
                  style={{ animationDelay: `${300 + i * 80}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-forest/[0.06] text-xs font-medium text-forest">
                          {kudo.from
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-stone-800">
                            {kudo.from}
                          </span>
                          <span className="ml-2 text-xs text-stone-400">
                            {kudo.date}
                          </span>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-stone-600">
                        &ldquo;{kudo.message}&rdquo;
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        valueColors[kudo.value] ?? "bg-stone-100 text-stone-600"
                      }`}
                    >
                      {kudo.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Given */}
        <div className="lg:col-span-5">
          <div
            className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ animationDelay: "300ms", boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
              Given
            </h3>
            <div className="space-y-4">
              {given.map((kudo, i) => (
                <div
                  key={kudo.id}
                  className="card-enter rounded-xl border border-stone-100 p-5 transition-colors hover:border-stone-200"
                  style={{ animationDelay: `${400 + i * 80}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-terracotta/10 text-xs font-medium text-terracotta">
                          {kudo.to
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-stone-800">
                            {kudo.to}
                          </span>
                          <span className="ml-2 text-xs text-stone-400">
                            {kudo.date}
                          </span>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-stone-600">
                        &ldquo;{kudo.message}&rdquo;
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        valueColors[kudo.value] ?? "bg-stone-100 text-stone-600"
                      }`}
                    >
                      {kudo.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Send kudos CTA */}
          <div
            className="card-enter mt-6 rounded-2xl border border-dashed border-stone-200 p-6 text-center"
            style={{ animationDelay: "500ms" }}
          >
            <p className="text-sm text-stone-500">
              Recognize a colleague&apos;s great work
            </p>
            <SendKudosModal users={users} values={values} />
          </div>
        </div>
      </div>
    </div>
  );
}
