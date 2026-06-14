import { useAgentEvents } from "../../../shell/AgentEventContext";
import { useSessionContext } from "../../../shell/SessionContext";
import { useAgentBusy } from "../../../shell/useAgentBusy";
import type { Widget } from "../../registry";
import { ExploreMenu } from "../ContextMenu";
import { DynamicIcon, resolveIconName } from "../lucideIcon";
import { useFillFromConversation } from "../useFillFromConversation";
import { useQueuedExplore } from "../useQueuedExplore";
import { WidgetEmptyState } from "../WidgetEmptyState";
import { WidgetLoading } from "../WidgetLoading";
import { WidgetReloadHeader } from "../WidgetReloadHeader";
import type { TimelineItem, TimelineSpec } from "./types";
import { useTimelineState } from "./useTimelineState";

// Shared by the empty-panel fill and the populated-widget reload so they stay aligned.
const TIMELINE_BUILD_PROMPT =
  "Build the best timeline you can about what we've been discussing. Draw on the events, dates, periods, and developments in the subject so far — and broaden from what was literally said: lay out the real chronology of the topic, not only dates someone typed. This is about the conversation so far, not future messages. Don't ask whether to do it or offer to do it later — call render_timeline now. Only skip if the subject genuinely has no chronological dimension at all.";

export function TimelineWidget(_props: { widget: Widget }) {
  const { entries, requestReplace } = useTimelineState();
  const busy = useAgentBusy();
  const { messages } = useSessionContext();
  const fill = useFillFromConversation({
    hasContent: entries.length > 0,
    gentlePrompt: TIMELINE_BUILD_PROMPT,
    forcedPrompt:
      "Call the render_timeline tool right now to lay out the most timeline-worthy events from our conversation so far.",
    displayText: "Update the Timeline from our conversation.",
  });

  // Reload = rebuild fresh; queues if a turn's in flight (latest-wins). Replace-on-
  // arrival: the current timeline stays until the new one lands, so an empty/failed
  // rebuild can't wipe the canvas tile.
  const reload = useQueuedExplore();
  function onReload() {
    reload.enqueue({
      prompt: TIMELINE_BUILD_PROMPT,
      displayText: "Rebuild the Timeline from our conversation.",
      onFire: requestReplace,
    });
  }

  if (entries.length === 0) {
    if (busy) return <WidgetLoading label="Laying out a timeline…" />;
    return (
      <WidgetEmptyState
        invitation="Ask about something chronological — a history, a sequence, or a schedule — and it'll be laid out here as a timeline."
        hasConversation={messages.length > 0}
        canUpdate={fill.canUpdate}
        onUpdate={fill.onUpdate}
        onReset={fill.reset}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <WidgetReloadHeader
        onReload={onReload}
        queued={reload.queued}
        label="Rebuild the timeline from the conversation"
      />
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-4">
        {entries.map(({ id, spec }) => (
          <SpecTimeline key={id} spec={spec} />
        ))}
      </div>
    </div>
  );
}

// Self-contained single-spec timeline (chronological, swimlanes, explore menu).
// Used by the Timeline tab and BigsailCard. Pure spec → JSX; canonical renderer.
export function SpecTimeline({ spec }: { spec: TimelineSpec }) {
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
            {lane.items.map((item, i) => {
              const dateLabel = item.end
                ? `${formatDate(item.start)} – ${formatDate(item.end)}`
                : formatDate(item.start);
              return (
                // Cascade items in on first paint (capped — see drip-row-in).
                // group/event drives the kebab's hover-reveal on pointer devices.
                <li
                  key={item.id}
                  className="group/event drip-row-in relative pr-9"
                  style={{ "--i": Math.min(i, 24) } as React.CSSProperties}
                >
                  <SpineMarker icon={item.icon} />
                  <DateRange item={item} />
                  <p className="text-sm text-content leading-snug">
                    {item.content}
                  </p>
                  {/* Visible on touch; hover/focus-reveal on pointer devices. */}
                  <div className="absolute top-0 right-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within/event:opacity-100 sm:group-hover/event:opacity-100">
                    <ExploreMenu
                      label="Explore this event"
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
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}

// Marker on the spine. When the model picked a valid lucide icon for the event we
// render it inside a pink ring; otherwise we keep the original small pink dot so
// nothing regresses for icon-less timelines. Mirrors the Knowledge Graph's
// per-node icon treatment (see lucideIcon.ts), which is what inspired this.
function SpineMarker({ icon }: { icon?: string }) {
  const name = icon ? resolveIconName(icon) : null;

  if (!name) {
    // Plain dot, centred on the spine (matches the pre-icon look).
    return (
      <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#ff2e9a] bg-surface" />
    );
  }

  // Pink ring badge with the icon centred inside, sitting on the spine line.
  return (
    <span className="absolute -left-7.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#ff2e9a] bg-surface text-[#ff2e9a]">
      <DynamicIcon name={name} size={11} strokeWidth={2.25} />
    </span>
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
