import { useAgentEvents } from "../../../shell/AgentEventContext";
import type { Widget } from "../../registry";
import { WithContextMenu } from "../ContextMenu";
import type { TimelineItem, TimelineSpec } from "./types";
import { useTimelineState } from "./useTimelineState";

export function TimelineWidget(_props: { widget: Widget }) {
  const { entries } = useTimelineState();

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-8 text-center text-sm text-content-subtle">
        Ask about something chronological — a history, a sequence, or a schedule
        — and it'll be laid out here as a timeline.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto bg-surface p-4">
      {entries.map(({ id, spec }) => (
        <SpecTimeline key={id} spec={spec} />
      ))}
    </div>
  );
}

function SpecTimeline({ spec }: { spec: TimelineSpec }) {
  const bus = useAgentEvents();
  // Ground each entry's explore prompt in the timeline title when present.
  const titleCtx = spec.title ? ` in the "${spec.title}" timeline` : "";

  // Sort chronologically by start date. Invalid dates sort to the end.
  const sorted = [...spec.items].sort((a, b) => {
    const ta = Date.parse(a.start);
    const tb = Date.parse(b.start);
    if (isNaN(ta) && isNaN(tb)) return 0;
    if (isNaN(ta)) return 1;
    if (isNaN(tb)) return -1;
    return ta - tb;
  });

  // Build a lookup from group id → label for the swimlane header.
  const groupLabel = new Map(spec.groups?.map((g) => [g.id, g.content]) ?? []);

  // Group items by their `group` field when groups are present; otherwise one
  // flat lane labelled undefined.
  const lanes: Array<{ key: string | undefined; items: TimelineItem[] }> = [];
  if (spec.groups && spec.groups.length > 0) {
    // Maintain the groups-array order for lanes, then append ungrouped at end.
    const seen = new Set<string>();
    for (const g of spec.groups) {
      lanes.push({
        key: g.id,
        items: sorted.filter((it) => it.group === g.id),
      });
      seen.add(g.id);
    }
    const ungrouped = sorted.filter((it) => !it.group || !seen.has(it.group));
    if (ungrouped.length > 0) lanes.push({ key: undefined, items: ungrouped });
  } else {
    lanes.push({ key: undefined, items: sorted });
  }

  return (
    <section className="flex flex-col gap-2">
      {spec.title && (
        <h2 className="font-display text-sm font-semibold text-content">
          {spec.title}
        </h2>
      )}
      {lanes.map((lane) => (
        <div key={lane.key ?? "__ungrouped"}>
          {lane.key !== undefined && (
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-content-subtle">
              {groupLabel.get(lane.key) ?? lane.key}
            </p>
          )}
          <ol className="relative border-l border-border-strong pl-5 space-y-4">
            {lane.items.map((item) => {
              const dateLabel = item.end
                ? `${formatDate(item.start)} – ${formatDate(item.end)}`
                : formatDate(item.start);
              return (
                <WithContextMenu
                  key={item.id}
                  items={[
                    {
                      label: "Explore further",
                      onClick: () =>
                        bus.emit({
                          type: "explore_request",
                          prompt: `Tell me more about this event${titleCtx}: ${dateLabel} — ${item.content}. What's significant about it and what to explore next.`,
                        }),
                    },
                  ]}
                >
                  <li className="relative">
                    {/* Dot on the spine */}
                    <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#ff2e9a] bg-surface" />
                    <DateRange item={item} />
                    <p className="text-sm text-content leading-snug">
                      {item.content}
                    </p>
                  </li>
                </WithContextMenu>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}

function DateRange({ item }: { item: TimelineItem }) {
  const start = formatDate(item.start);
  const end = item.end ? formatDate(item.end) : null;
  const label = end && end !== start ? `${start} – ${end}` : start;
  return (
    <time
      dateTime={item.start}
      className="block text-xs text-content-subtle mb-0.5"
    >
      {label}
    </time>
  );
}

// Format an ISO date string for display. Year-only, month+year, or full date
// depending on the precision the model provided. Falls back to the raw string.
function formatDate(iso: string): string {
  // Year-only: "2024"
  if (/^\d{4}$/.test(iso)) return iso;
  // Year-month: "2024-06"
  if (/^\d{4}-\d{2}$/.test(iso)) {
    const d = new Date(`${iso}-01`);
    return isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
