import { useEffect, useRef } from "react";
import type { LogEntry } from "./useAgentDiagramState";

// A running console of the agent-loop steps. Fixed at three lines tall, scrollable,
// monospace. Cleared on each new send (the state hook empties `log` on
// request_start); auto-scrolls to the newest line as steps land.
export function StepConsole({ log }: { log: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: log.length is the trigger, not a value the effect reads
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [log.length]);

  return (
    <div className="border-t border-neutral-800 px-3 py-2">
      {/* ~3 lines tall (line-height 1rem × 3) + padding, scrollable past that. */}
      <div className="h-12 overflow-y-auto font-mono text-[11px] leading-4">
        {log.length === 0 ? (
          <div className="text-neutral-600">
            console — steps appear here as the loop runs
          </div>
        ) : (
          log.map((entry) => (
            <div key={entry.seq} className="flex gap-2 text-neutral-400">
              <span className="shrink-0 text-neutral-600">{entry.t}</span>
              <span className="truncate">{entry.text}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
