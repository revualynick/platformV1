import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { EmptyState } from "@/components/empty-state";
import PeopleChart from "./people-chart";

export default async function PeoplePage() {
  const session = await auth();

  if (!isDemoSession(session)) {
    return (
      <div className="max-w-[1200px]">
        <div className="mb-8">
          <p className="text-sm font-medium text-stone-400">Organization</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
            People & Structure
          </h1>
        </div>
        <EmptyState
          icon="👥"
          title="No people data yet"
          description="Import your org structure or add team members to see the interactive org chart."
        />
      </div>
    );
  }

  return <PeopleChart />;
}
