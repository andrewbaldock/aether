// The render_images spec now lives in the shared FE↔BE contract (shared/contract,
// plan 001) — re-exported here so existing `./types` importers are unchanged.
export type { ImageItem, ImagesSpec } from "@contract/widgets";
