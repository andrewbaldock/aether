import { getRenderer } from "../capabilities/registry";
import { useCapabilities } from "../capabilities/useCapabilities";
import { Tooltip } from "./Tooltip";

// Right zone: tabbed widget host. Both agent and user drive it via the capability store.
// Each widget is drawn by the renderer registered against its `type`.
export function CapabilityColumn() {
  const {
    widgets,
    activeId,
    unseen,
    isFullscreen,
    activate,
    close,
    setFullscreen,
  } = useCapabilities();
  const active = widgets.find((w) => w.id === activeId) ?? null;
  const Renderer = active ? getRenderer(active.type) : undefined;

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-surface">
      {/* tab bar */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {widgets.map((w) => (
            <div
              key={w.id}
              className={
                w.id === activeId
                  ? "flex items-center gap-1 rounded-md bg-elevated pr-1.5 text-xs font-medium text-content"
                  : "flex items-center gap-1 rounded-md pr-1.5 text-xs text-content-muted hover:bg-elevated/60"
              }
            >
              <button
                type="button"
                onClick={() => activate(w.id)}
                className="flex max-w-32 items-center gap-1.5 rounded-md py-1.5 pl-3"
              >
                {/* Glowing dot when this tab has new content the user hasn't
                    viewed yet. Cleared the moment the tab is activated. */}
                {unseen.includes(w.id) && (
                  <span
                    role="img"
                    aria-label="New content"
                    className="aether-unseen-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[#fd40a4]"
                  />
                )}
                <span className="truncate">{w.title}</span>
              </button>
              {/* No Tooltip wrapper here: this row is an overflow-x-auto scroll
                  container, and the tooltip's positioned bubble overflowed it
                  vertically, showing a spurious scrollbar. The × close affordance
                  is self-evident; aria-label keeps it accessible. */}
              <button
                type="button"
                aria-label={`Close ${w.title}`}
                onClick={() => close(w.id)}
                className="rounded text-content-subtle hover:text-content"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Expand-to-full-page is meaningless on mobile: the capability widget
            is already a full-screen overlay in MobileShell. Hide it < md. */}
        <Tooltip
          label={isFullscreen ? "Exit full page" : "Expand to full page"}
          side="bottom"
          className="max-md:hidden"
        >
          <button
            type="button"
            onClick={() => setFullscreen(!isFullscreen)}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="rounded-md px-2 py-1.5 text-sm text-content-muted hover:bg-elevated hover:text-content"
          >
            {isFullscreen ? "⤢" : "⛶"}
          </button>
        </Tooltip>
      </div>

      {/* active widget — vertical scroll only; widgets manage their own width
          (the graph pans/zooms internally), so a horizontal scrollbar here is
          always spurious. */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden text-content">
        {active && Renderer ? (
          <Renderer widget={active} />
        ) : active ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-content-subtle">
            No renderer registered for type “{active.type}”.
          </div>
        ) : null}
      </div>
    </div>
  );
}
