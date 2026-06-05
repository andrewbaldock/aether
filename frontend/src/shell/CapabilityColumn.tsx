import { getRenderer } from "../capabilities/registry";
import { useCapabilities } from "../capabilities/useCapabilities";
import { Tooltip } from "./Tooltip";

// Right zone: tabbed widget host. Both agent and user drive it via the capability store.
// Each widget is drawn by the renderer registered against its `type`.
export function CapabilityColumn() {
  const { widgets, activeId, isFullscreen, activate, close, setFullscreen } =
    useCapabilities();
  const active = widgets.find((w) => w.id === activeId) ?? null;
  const Renderer = active ? getRenderer(active.type) : undefined;

  return (
    <div className="flex h-full flex-col bg-surface">
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
                className="max-w-32 truncate rounded-md py-1.5 pl-3"
              >
                {w.title}
              </button>
              <Tooltip label={`Close ${w.title}`} side="bottom">
                <button
                  type="button"
                  aria-label={`Close ${w.title}`}
                  onClick={() => close(w.id)}
                  className="rounded text-content-subtle hover:text-content"
                >
                  ×
                </button>
              </Tooltip>
            </div>
          ))}
        </div>

        <Tooltip
          label={isFullscreen ? "Exit full page" : "Expand to full page"}
          side="bottom"
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

      {/* active widget */}
      <div className="flex-1 overflow-auto text-content">
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
