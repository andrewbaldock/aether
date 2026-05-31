import { getRenderer } from "../capabilities/registry";
import { useCapabilities } from "../capabilities/useCapabilities";

// Right zone: tabbed widget host. Both agent and user drive it via the capability store.
// Each widget is drawn by the renderer registered against its `type`.
export function CapabilityColumn() {
  const { widgets, activeId, isFullscreen, activate, close, setFullscreen } =
    useCapabilities();
  const active = widgets.find((w) => w.id === activeId) ?? null;
  const Renderer = active ? getRenderer(active.type) : undefined;

  return (
    <div className="flex h-full flex-col bg-neutral-900">
      {/* tab bar */}
      <div className="flex items-center gap-1 border-b border-neutral-800 px-2 py-1.5">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {widgets.map((w) => (
            <div
              key={w.id}
              className={
                w.id === activeId
                  ? "flex items-center gap-1 rounded-md bg-neutral-800 pr-1.5 text-xs font-medium text-neutral-100"
                  : "flex items-center gap-1 rounded-md pr-1.5 text-xs text-neutral-400 hover:bg-neutral-800/60"
              }
            >
              <button
                type="button"
                onClick={() => activate(w.id)}
                className="max-w-32 truncate rounded-md py-1.5 pl-3"
              >
                {w.title}
              </button>
              <button
                type="button"
                aria-label={`Close ${w.title}`}
                onClick={() => close(w.id)}
                className="rounded text-neutral-500 hover:text-neutral-200"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setFullscreen(!isFullscreen)}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="rounded-md px-2 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          {isFullscreen ? "⤢" : "⛶"}
        </button>
      </div>

      {/* active widget */}
      <div className="flex-1 overflow-auto text-neutral-200">
        {active && Renderer ? (
          <Renderer widget={active} />
        ) : active ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-neutral-500">
            No renderer registered for type “{active.type}”.
          </div>
        ) : null}
      </div>
    </div>
  );
}
