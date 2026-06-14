import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  type XAxisTickContentProps,
  YAxis,
} from "recharts";
import { useAgentEvents } from "../../../shell/AgentEventContext";
import { useSessionContext } from "../../../shell/SessionContext";
import { useAgentBusy } from "../../../shell/useAgentBusy";
import type { Widget } from "../../registry";
import { ExploreMenu, WithContextMenu } from "../ContextMenu";
import { useFillFromConversation } from "../useFillFromConversation";
import { useQueuedExplore } from "../useQueuedExplore";
import { WidgetEmptyState } from "../WidgetEmptyState";
import { WidgetLoading } from "../WidgetLoading";
import { WidgetReloadHeader } from "../WidgetReloadHeader";
import type { ChartSpec } from "./types";
import { useChartState } from "./useChartState";

// The rich "build the best chart you can" instruction, shared by the empty-panel
// fill and the populated-widget reload. Kept as a const so both stay in lockstep.
const CHART_BUILD_PROMPT =
  "Build the best chart you can about what we've been discussing. Visualize the quantitative shape of the subject — trends, distributions, or comparisons — and broaden from what was literally said: chart the real numbers the topic involves, fetching figures from your data sources if needed rather than only plotting numbers someone typed. Choose the form and comparison that fit — line for trends, a multi-series or stacked bar for real comparisons, horizontal bars for rankings, a rate or share on the value axis when that's the truer story — not always a vertical bar of raw counts. This is about the conversation so far, not future messages. Don't ask whether to do it or offer to do it later — call render_chart now. Only skip if the subject genuinely has no quantitative dimension at all.";

// Named palette for line/bar/area series (up to ~12 before cycling). Anchored to
// the brand neons then spreads across the spectrum so adjacent series are distinct.
const PALETTE = [
  "#ff2e9a", // neon pink (brand)
  "#16c2ff", // neon cyan (brand)
  "#c35ed1", // violet
  "#f5a623", // amber
  "#3ecf8e", // green
  "#ff6b6b", // coral
  "#4ecdc4", // teal
  "#ffe66d", // yellow
  "#a29bfe", // lavender
  "#fd79a8", // rose
  "#55efc4", // mint
  "#fdcb6e", // peach
] as const;

// For pie charts the slice count is data-driven and can exceed any fixed palette.
// Generate a color by spreading slices evenly around the HSL wheel, keeping
// saturation and lightness tuned for the dark theme. Always returns a string.
function pieColor(index: number, total: number): string {
  const hue = Math.round((index / Math.max(total, 1)) * 360);
  return `hsl(${hue}, 80%, 62%)`;
}

// For series (line/bar/area): cycle the named palette, fall back to hsl spread.
function paletteColor(index: number): string {
  return (
    PALETTE[index % PALETTE.length] ?? `hsl(${(index * 47) % 360}, 75%, 60%)`
  );
}

function seriesColor(color: string | undefined, index: number): string {
  return color ?? paletteColor(index);
}

// "Chart" — renders every render_chart spec from the conversation, stacked in one
// scrollable tab. Recharts for the rendering; brand colors as defaults. The
// `widget` prop is unused; state is live.
export function ChartWidget(_props: { widget: Widget }) {
  const { entries, clearEntries } = useChartState();
  const bus = useAgentEvents();
  const busy = useAgentBusy();
  const { messages } = useSessionContext();
  const fill = useFillFromConversation({
    hasContent: entries.length > 0,
    gentlePrompt: CHART_BUILD_PROMPT,
    forcedPrompt:
      "Call the render_chart tool right now to visualize the most chart-worthy numbers from our conversation so far.",
    displayText: "Update the Chart from our conversation.",
  });

  // Reload = clear the current charts and rebuild fresh from the conversation.
  // Queues (latest-wins) if a turn's in flight rather than greying out.
  const reload = useQueuedExplore();
  function onReload() {
    reload.enqueue({
      prompt: CHART_BUILD_PROMPT,
      displayText: "Rebuild the Chart from our conversation.",
      onFire: clearEntries,
    });
  }

  if (entries.length === 0) {
    if (busy) return <WidgetLoading label="Drawing a chart…" />;
    return (
      <WidgetEmptyState
        invitation="Ask for something quantitative — a trend or a comparison — and it'll be charted here."
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
        label="Rebuild the chart from the conversation"
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        {entries.map(({ id, spec }) => {
          const label = spec.title ?? `${spec.type} chart`;
          const chart = (
            <section className="flex flex-col gap-1">
              {spec.title && (
                <h2 className="font-display text-sm font-semibold text-content">
                  {spec.title}
                </h2>
              )}
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <SpecChart spec={spec} />
                </ResponsiveContainer>
              </div>
              {/* Explore surface. A pie's single series IS the whole chart, so it
                gets one whole-chart target; line/bar/area get one chip per
                series. Recharts' SVG internals don't take a DOM wrapper, so the
                explore affordance lives in these chips (a kebab beside the
                label), not on the plotted marks. */}
              {spec.type !== "pie" && (
                <ul className="flex flex-wrap gap-1.5 pt-1">
                  {spec.series.map((s, i) => (
                    <li key={s.key}>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border py-0.5 pr-0.5 pl-2 text-xs text-content-muted">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: seriesColor(s.color, i) }}
                          aria-hidden
                        />
                        {s.label ?? s.key}
                        <ExploreMenu
                          label={`Explore the ${s.label ?? s.key} series`}
                          items={[
                            {
                              label: "Explore further",
                              onClick: () =>
                                bus.emit({
                                  type: "explore_request",
                                  prompt: `Tell me more about the "${s.label ?? s.key}" series in the "${label}" chart — what the trend means and what to explore next.`,
                                }),
                            },
                          ]}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );

          // Pie: keep a single whole-chart explore target.
          if (spec.type === "pie") {
            return (
              <WithContextMenu
                key={id}
                label={`Explore the ${label}`}
                items={[
                  {
                    label: "Explore further",
                    onClick: () =>
                      bus.emit({
                        type: "explore_request",
                        prompt: `Tell me more about the data in the "${label}" — what's interesting, what the trends mean, and what I should explore next.`,
                      }),
                  },
                ]}
              >
                {chart}
              </WithContextMenu>
            );
          }

          return <div key={id}>{chart}</div>;
        })}
      </div>
    </div>
  );
}

// Axis/grid colors read from the theme so the chart matches light/dark. Plain
// hex via CSS vars isn't available to Recharts SVG props directly, so use the
// muted content tone.
const AXIS_COLOR = "currentColor";

// The bare recharts node for one chart spec. Caller supplies the sizing wrapper
// (ResponsiveContainer) and optional title — the ChartWidget tab does, and so does
// BigsailCard. Pure spec → JSX; this is the canonical single-spec renderer.
export function SpecChart({ spec }: { spec: ChartSpec }) {
  const common = {
    data: spec.data,
  };

  if (spec.type === "pie") {
    // Pie uses the first series as the value field; each datum becomes a slice
    // labelled by xKey.
    const valueKey = spec.series[0]?.key;
    if (!valueKey) return <Empty />;
    return (
      <PieChart>
        <RechartsTooltip />
        <Legend />
        <Pie
          data={spec.data}
          dataKey={valueKey}
          nameKey={spec.xKey}
          cx="50%"
          cy="50%"
          outerRadius="80%"
          label
        >
          {spec.data.map((_, i) => (
            // Slice order is stable for a given spec; index key is fine here.
            // biome-ignore lint/suspicious/noArrayIndexKey: stable slice order
            <Cell key={i} fill={pieColor(i, spec.data.length)} />
          ))}
        </Pie>
      </PieChart>
    );
  }

  if (spec.type === "bar") {
    const horizontal = spec.orientation === "horizontal";
    // Recharts inverts its layout naming: a HORIZONTAL bar chart (bars run
    // left→right) is layout="vertical". Then the category sits on Y and the value
    // on X; upright, it's the reverse. Build both axes against the slot each one
    // occupies for this orientation.
    const stackId = spec.stacked ? "stack" : undefined;
    return (
      <BarChart {...common} layout={horizontal ? "vertical" : "horizontal"}>
        <CartesianGrid strokeOpacity={0.15} />
        <CategoryAxis
          axis={horizontal ? "y" : "x"}
          xKey={spec.xKey}
          label={spec.xLabel}
          count={spec.data.length}
        />
        <ValueAxis axis={horizontal ? "x" : "y"} label={spec.yLabel} />
        <RechartsTooltip />
        <Legend />
        {spec.series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label ?? s.key}
            fill={seriesColor(s.color, i)}
            stackId={stackId}
          >
            {/* Single-series bar charts: color each bar by category (like a pie).
                Multi-series: use the series color uniformly (Cells would override
                the per-series distinction). */}
            {spec.series.length === 1
              ? spec.data.map((_, di) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable bar order
                  <Cell key={di} fill={pieColor(di, spec.data.length)} />
                ))
              : null}
          </Bar>
        ))}
      </BarChart>
    );
  }

  if (spec.type === "area") {
    const stackId = spec.stacked ? "stack" : undefined;
    return (
      <AreaChart {...common}>
        <CartesianGrid strokeOpacity={0.15} />
        <CategoryAxis
          axis="x"
          xKey={spec.xKey}
          label={spec.xLabel}
          count={spec.data.length}
        />
        <ValueAxis axis="y" label={spec.yLabel} />
        <RechartsTooltip />
        <Legend />
        {spec.series.map((s, i) => {
          const color = seriesColor(s.color, i);
          return (
            <Area
              key={s.key}
              dataKey={s.key}
              name={s.label ?? s.key}
              stroke={color}
              fill={color}
              fillOpacity={0.25}
              stackId={stackId}
            />
          );
        })}
      </AreaChart>
    );
  }

  // Default: line.
  return (
    <LineChart {...common}>
      <CartesianGrid strokeOpacity={0.15} />
      <CategoryAxis
        axis="x"
        xKey={spec.xKey}
        label={spec.xLabel}
        count={spec.data.length}
      />
      <ValueAxis axis="y" label={spec.yLabel} />
      <RechartsTooltip />
      <Legend />
      {spec.series.map((s, i) => (
        <Line
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.label ?? s.key}
          stroke={seriesColor(s.color, i)}
          dot={false}
        />
      ))}
    </LineChart>
  );
}

// The category axis (the xKey dimension). `axis` is the SLOT it occupies for the
// current orientation: "x" for upright charts, "y" for a horizontal bar chart
// (Recharts layout="vertical"), where it also needs extra width so long labels
// read. Recharts dispatches axis components by type, so these must be returned as
// bare <XAxis>/<YAxis>, not wrapped.
// An x-axis tick that angles the label and truncates over-long text, so labels
// stay legible instead of overlapping or being silently dropped by recharts.
const TICK_MAX_CHARS = 16;
function AngledTick(props: XAxisTickContentProps) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const raw = String(props.payload?.value ?? "");
  const text =
    raw.length > TICK_MAX_CHARS ? `${raw.slice(0, TICK_MAX_CHARS - 1)}…` : raw;
  return (
    <text
      x={x}
      y={y}
      dy={4}
      dx={-4}
      textAnchor="end"
      transform={`rotate(-35, ${x}, ${y})`}
      fill={AXIS_COLOR}
      fontSize={11}
    >
      {text}
    </text>
  );
}

function CategoryAxis({
  axis,
  xKey,
  label,
  count = 0,
}: {
  axis: "x" | "y";
  xKey: string;
  label?: string;
  count?: number;
}) {
  if (axis === "x") {
    // Show every label when there's room; once they'd collide, let recharts
    // thin them evenly (interval="preserveStartEnd") rather than clipping the
    // ends. Angled, truncating ticks keep long labels readable either way.
    const dense = count > 12;
    return (
      <XAxis
        dataKey={xKey}
        stroke={AXIS_COLOR}
        fontSize={12}
        height={56}
        interval={dense ? "preserveStartEnd" : 0}
        tick={AngledTick}
        tickMargin={8}
      >
        {label ? <Label value={label} position="bottom" fontSize={11} /> : null}
      </XAxis>
    );
  }
  return (
    <YAxis
      type="category"
      dataKey={xKey}
      width={120}
      stroke={AXIS_COLOR}
      fontSize={12}
    >
      {label ? (
        <Label value={label} angle={-90} position="left" fontSize={11} />
      ) : null}
    </YAxis>
  );
}

// The value axis (the numeric series). `axis` is the slot it occupies: "y" for
// upright charts, "x" for a horizontal bar chart. `label` lets it read a rate or
// index rather than an implied raw count.
function ValueAxis({ axis, label }: { axis: "x" | "y"; label?: string }) {
  if (axis === "x") {
    return (
      <XAxis type="number" stroke={AXIS_COLOR} fontSize={12}>
        {label ? <Label value={label} position="bottom" fontSize={11} /> : null}
      </XAxis>
    );
  }
  return (
    <YAxis stroke={AXIS_COLOR} fontSize={12}>
      {label ? (
        <Label value={label} angle={-90} position="left" fontSize={11} />
      ) : null}
    </YAxis>
  );
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-content-subtle">
      No data to chart.
    </div>
  );
}
