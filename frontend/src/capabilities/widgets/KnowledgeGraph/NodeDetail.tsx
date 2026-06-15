import { safeHref } from "../../../lib/links";
import { Tooltip } from "../../../shell/Tooltip";
import { TYPE_COLOR, TYPE_LABEL } from "./colors";
import type { GraphNode } from "./types";
import { useWikipedia } from "./useWikipedia";

interface NodeDetailProps {
  node: GraphNode;
  onClose: () => void;
}

// The selected node's detail card: a Wikipedia summary (thumbnail + extract +
// link) for the entity, fetched client-side. Sits below the graph.
export function NodeDetail({ node, onClose }: NodeDetailProps) {
  const { summary, loading, error } = useWikipedia(
    node.wikipediaTitle ?? node.label
  );
  const color = TYPE_COLOR[node.type];

  return (
    <div className="border-t border-border bg-surface-raised p-3 text-sm">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="font-medium text-content">{node.label}</span>
          <span className="text-xs text-content-faint">
            {TYPE_LABEL[node.type]}
          </span>
        </div>
        <Tooltip label="Close detail" side="left">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail"
            className="rounded text-content-subtle hover:text-content"
          >
            ×
          </button>
        </Tooltip>
      </div>

      {loading && <p className="text-xs text-content-subtle">Loading…</p>}
      {error && !loading && (
        <p className="text-xs text-content-subtle">{error}</p>
      )}
      {summary && !loading && (
        <div className="flex gap-3">
          {summary.thumbnail && (
            <img
              src={summary.thumbnail}
              alt={summary.title}
              className="h-16 w-16 shrink-0 rounded object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="text-xs leading-relaxed text-content-muted line-clamp-4">
              {summary.extract}
            </p>
            {safeHref(summary.pageUrl) && (
              <a
                href={safeHref(summary.pageUrl)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs text-neon-cyan hover:underline"
              >
                Read on Wikipedia →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
