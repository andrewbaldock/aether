// The render_table spec now lives in the shared FE↔BE contract (shared/contract,
// plan 001) — re-exported here so existing `./types` importers are unchanged.
export type { ColumnType, TableColumn, TableSpec } from "@contract/widgets";
