interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    href: string;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <span className="text-4xl mb-4">{icon}</span>}
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-[var(--color-text-secondary)] max-w-md mb-6">
          {description}
        </p>
      )}
      {action && (
        <a
          href={action.href}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
