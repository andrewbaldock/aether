import { registerRenderer, type Widget } from "../registry";

// A demo renderer that proves the plugin seam: it claims a `type` and draws that
// widget's `state`. Real experiences (a 3dverse scene, a data view) register the same way.
function PlaceholderWidget({ widget }: { widget: Widget }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-5xl">🧩</div>
      <div className="text-lg font-medium text-content">{widget.title}</div>
      <div className="text-sm text-content-subtle">
        Capability widget{" "}
        <code className="text-content-muted">{widget.type}</code> — a renderer
        registered against the capability registry. Real widgets (3D scenes,
        data views) plug in here.
      </div>
      {typeof widget.state === "string" && widget.state.length > 0 && (
        <div className="mt-2 rounded-md bg-elevated px-3 py-1.5 text-xs text-content-muted">
          {widget.state}
        </div>
      )}
    </div>
  );
}

registerRenderer("placeholder", PlaceholderWidget);
