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
import type { Widget } from "../../registry";
import type { ChartSpec } from "./types";
import { useChartState } from "./useChartState";

// Brand-derived default palette, used when a series doesn't name its own color.
// Cycles for additional series. Pink → cyan → violet → amber → green.
const PALETTE = [
  "#ff2e9a",
  "#16c2ff",
  "#c35ed1",
  "#f5a623",
  "#3ecf8e",
] as const;

// Indexing is modulo PALETTE.length so it always lands in range, but TS's
// noUncheckedIndexedAccess still widens to `| undefined` — fall back to the first
// color to keep the return a plain string.
function paletteColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? PALETTE[0];
}

function seriesColor(color: string | undefined, index: number): string {
  return color ?? paletteColor(index);
}

// "Chart" — renders every render_chart spec from the conversation, stacked in one
// scrollable tab. Recharts for the rendering; brand colors as defaults. The
// `widget` prop is unused; state is live.
export function ChartWidget(_props: { widget: Widget }) {
  const { entries } = useChartState();

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-8 text-center text-sm text-content-subtle">
        Ask for something quantitative — a trend or a comparison — and it'll be
        charted here.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto bg-surface p-4">
      {entries.map(({ id, spec }) => (
        <section key={id} className="flex flex-col gap-1">
          {spec.title && (
            <h2 className="font-display text-sm font-semibold text-content">
              {spec.title}
            </h2>
          )}
          {/* Fixed height per chart so ResponsiveContainer has a box to fill in
              the scrolling stack. */}
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <SpecChart spec={spec} />
            </ResponsiveContainer>
          </div>
        </section>
      ))}
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
            <Cell key={i} fill={paletteColor(i)} />
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
          />
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
