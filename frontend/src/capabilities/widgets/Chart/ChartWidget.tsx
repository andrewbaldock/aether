import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { useAgentEvents } from "../../../shell/AgentEventContext";
import { useAgentBusy } from "../../../shell/useAgentBusy";
import type { Widget } from "../../registry";
import { WithContextMenu } from "../ContextMenu";
import { WidgetLoading } from "../WidgetLoading";
import type { ChartSpec } from "./types";
import { useChartState } from "./useChartState";

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
  const { entries } = useChartState();
  const bus = useAgentEvents();
  const busy = useAgentBusy();

  if (entries.length === 0) {
    if (busy) return <WidgetLoading label="Drawing a chart…" />;
    return (
      <div className="flex h-full items-center justify-center bg-surface p-8 text-center text-sm text-content-subtle">
        Ask for something quantitative — a trend or a comparison — and it'll be
        charted here.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto bg-surface p-4">
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
                right-click target lives in these chips, not on the plotted
                marks. */}
            {spec.type !== "pie" && (
              <ul className="flex flex-wrap gap-1.5 pt-1">
                {spec.series.map((s, i) => (
                  <li key={s.key}>
                    <WithContextMenu
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
                    >
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-content-muted">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: seriesColor(s.color, i) }}
                          aria-hidden
                        />
                        {s.label ?? s.key}
                      </span>
                    </WithContextMenu>
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
  );
}

// Axis/grid colors read from the theme so the chart matches light/dark. Plain
// hex via CSS vars isn't available to Recharts SVG props directly, so use the
// muted content tone.
const AXIS_COLOR = "currentColor";

function SpecChart({ spec }: { spec: ChartSpec }) {
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
    return (
      <BarChart {...common}>
        <CartesianGrid strokeOpacity={0.15} />
        <XAxis dataKey={spec.xKey} stroke={AXIS_COLOR} fontSize={12} />
        <YAxis stroke={AXIS_COLOR} fontSize={12} />
        <RechartsTooltip />
        <Legend />
        {spec.series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label ?? s.key}
            fill={seriesColor(s.color, i)}
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
    return (
      <AreaChart {...common}>
        <CartesianGrid strokeOpacity={0.15} />
        <XAxis dataKey={spec.xKey} stroke={AXIS_COLOR} fontSize={12} />
        <YAxis stroke={AXIS_COLOR} fontSize={12} />
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
      <XAxis dataKey={spec.xKey} stroke={AXIS_COLOR} fontSize={12} />
      <YAxis stroke={AXIS_COLOR} fontSize={12} />
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

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-content-subtle">
      No data to chart.
    </div>
  );
}
