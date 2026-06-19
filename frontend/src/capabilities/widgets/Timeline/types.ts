// The render_timeline spec now lives in the shared FE↔BE contract (shared/contract,
// plan 001) — re-exported here so existing `./types` importers are unchanged.
export type {
  TimelineGroup,
  TimelineItem,
  TimelineSpec,
} from "@contract/widgets";
