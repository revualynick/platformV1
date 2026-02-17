export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
          Settings
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Manage your notification preferences and account settings.
        </p>
      </div>
      {children}
    </div>
  );
}
