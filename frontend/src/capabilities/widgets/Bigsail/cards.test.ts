import { describe, expect, it } from "vitest";
import type { ChartSpec } from "../Chart/types";
import type { ImagesSpec } from "../Images/types";
import type { TableSpec } from "../Table/types";
import type { TimelineSpec } from "../Timeline/types";
import { sizeHintFor, type ToCardsInput, toCards } from "./cards";

const tableSpec = (rows: number): TableSpec => ({
  title: "T",
  columns: [{ key: "a", label: "A" }],
  rows: Array.from({ length: rows }, (_, i) => ({ a: i })),
});

const chartSpec: ChartSpec = {
  type: "line",
  data: [{ x: 1, y: 2 }],
  xKey: "x",
  series: [{ key: "y" }],
};

const timelineSpec = (items: number): TimelineSpec => ({
  items: Array.from({ length: items }, (_, i) => ({
    id: String(i),
    content: "e",
    start: "2020",
  })),
});

const imagesSpec = (n: number): ImagesSpec => ({
  images: Array.from({ length: n }, (_, i) => ({ url: `u${i}` })),
});

const emptyInput = (): ToCardsInput => ({
  table: [],
  chart: [],
  timeline: [],
  images: [],
  graph: null,
});

describe("toCards", () => {
  it("returns no cards for empty state", () => {
    expect(toCards(emptyInput())).toEqual([]);
  });

  it("derives one card per entry, graph first", () => {
    const cards = toCards({
      ...emptyInput(),
      table: [{ id: 0, spec: tableSpec(2) }],
      chart: [{ id: 1, spec: chartSpec }],
      graph: { nodes: [{ id: "n", label: "N", type: "concept" }], links: [] },
    });
    expect(cards.map((c) => c.capabilityType)).toEqual([
      "knowledge-graph",
      "table",
      "chart",
    ]);
  });

  it("omits the graph card when the graph has no nodes", () => {
    const cards = toCards({ ...emptyInput(), graph: { nodes: [], links: [] } });
    expect(cards).toEqual([]);
  });

  it("produces stable ids of the form capability:sourceId", () => {
    const cards = toCards({
      ...emptyInput(),
      timeline: [{ id: 7, spec: timelineSpec(1) }],
    });
    expect(cards[0]?.id).toBe("timeline:7");
  });

  it("is deterministic across calls", () => {
    const input = {
      ...emptyInput(),
      table: [{ id: 0, spec: tableSpec(1) }],
      images: [{ id: 3, spec: imagesSpec(2) }],
    };
    expect(toCards(input)).toEqual(toCards(input));
  });
});

describe("sizeHintFor", () => {
  it("grows table height with row count", () => {
    const small = sizeHintFor({ capabilityType: "table", spec: tableSpec(1) });
    const big = sizeHintFor({ capabilityType: "table", spec: tableSpec(10) });
    expect(big.h).toBeGreaterThan(small.h);
    expect(big.w).toBe(small.w); // width is fixed per type
  });

  it("caps table growth so a huge result can't explode", () => {
    const capped = sizeHintFor({
      capabilityType: "table",
      spec: tableSpec(1000),
    });
    const at16 = sizeHintFor({ capabilityType: "table", spec: tableSpec(16) });
    expect(capped.h).toBe(at16.h);
  });

  it("gives chart and knowledge-graph a fixed size", () => {
    const c1 = sizeHintFor({ capabilityType: "chart", spec: chartSpec });
    const c2 = sizeHintFor({ capabilityType: "chart", spec: chartSpec });
    expect(c1).toEqual(c2);
  });
});
