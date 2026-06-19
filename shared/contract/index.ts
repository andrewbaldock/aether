// shared/contract — the single source of truth for the frontend↔backend wire contract.
// See ./README.md. Imported by both packages via the `@contract/*` tsconfig path
// (+ a matching vite resolve.alias). Do NOT re-declare these shapes in either package.
export * from "./plan";
export * from "./sse";
export * from "./widgets";
