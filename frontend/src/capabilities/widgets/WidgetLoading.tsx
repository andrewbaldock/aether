// A branded loading state shown inside a capability while the agent is working a
// turn but that widget has no content yet. Each widget passes its own `label` so
// the spinner reads as "this capability is being prepared" even before (or if)
// any data lands. Pairs with the per-widget empty-state message, which shows when
// the agent is idle and there's still nothing.
export function WidgetLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface p-8 text-center">
      <span
        className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-neon-pink"
        role="status"
        aria-label="Loading"
      />
      <p className="text-sm text-content-muted">{label}</p>
    </div>
  );
}
