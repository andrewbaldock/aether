# Graph Report - .  (2026-06-24)

## Corpus Check
- 224 files · ~143,065 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1175 nodes · 2504 edges · 60 communities (58 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.84)
- Token cost: 53,142 input · 17,714 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Render Widgets & Agent Events|Render Widgets & Agent Events]]
- [[_COMMUNITY_Session & Chat State|Session & Chat State]]
- [[_COMMUNITY_Knowledge Graph Widget|Knowledge Graph Widget]]
- [[_COMMUNITY_Agent Diagram Widget|Agent Diagram Widget]]
- [[_COMMUNITY_Contract Planner & Wire Types|Contract: Planner & Wire Types]]
- [[_COMMUNITY_Backend Tools & Image Search|Backend Tools & Image Search]]
- [[_COMMUNITY_E2E Tests & Mock API|E2E Tests & Mock API]]
- [[_COMMUNITY_Admin & Settings Widgets|Admin & Settings Widgets]]
- [[_COMMUNITY_Backend DB Layer|Backend DB Layer]]
- [[_COMMUNITY_Agent Loop & JSON Salvage|Agent Loop & JSON Salvage]]
- [[_COMMUNITY_Chat Panel & Starters|Chat Panel & Starters]]
- [[_COMMUNITY_Capability Tabs & Admin Nav|Capability Tabs & Admin Nav]]
- [[_COMMUNITY_Agent Loop Tests|Agent Loop Tests]]
- [[_COMMUNITY_App Shell & Layout|App Shell & Layout]]
- [[_COMMUNITY_Widget State Hooks & Edit|Widget State Hooks & Edit]]
- [[_COMMUNITY_Streaming Widget Providers|Streaming Widget Providers]]
- [[_COMMUNITY_Backend Dependencies|Backend Dependencies]]
- [[_COMMUNITY_Bigsail Card Specs|Bigsail Card Specs]]
- [[_COMMUNITY_Frontend Biome Config|Frontend Biome Config]]
- [[_COMMUNITY_Frontend Runtime Deps|Frontend Runtime Deps]]
- [[_COMMUNITY_Bigsail Plan & Skeletons|Bigsail Plan & Skeletons]]
- [[_COMMUNITY_Backend Server & Model Registry|Backend Server & Model Registry]]
- [[_COMMUNITY_Bigsail Widget & Content|Bigsail Widget & Content]]
- [[_COMMUNITY_Frontend Dev Dependencies|Frontend Dev Dependencies]]
- [[_COMMUNITY_Graph Persistence & Versioning|Graph Persistence & Versioning]]
- [[_COMMUNITY_Renderer Registry & App Root|Renderer Registry & App Root]]
- [[_COMMUNITY_Backend Biome Config|Backend Biome Config]]
- [[_COMMUNITY_Widget Persistence & Guards|Widget Persistence & Guards]]
- [[_COMMUNITY_Frontend App TSConfig|Frontend App TSConfig]]
- [[_COMMUNITY_Backend TSConfig|Backend TSConfig]]
- [[_COMMUNITY_Frontend Build Scripts|Frontend Build Scripts]]
- [[_COMMUNITY_Model Picker & Tooltip|Model Picker & Tooltip]]
- [[_COMMUNITY_Frontend Node TSConfig|Frontend Node TSConfig]]
- [[_COMMUNITY_Theme & Toasts|Theme & Toasts]]
- [[_COMMUNITY_Card Regeneration & Back|Card Regeneration & Back]]
- [[_COMMUNITY_File Attachments|File Attachments]]
- [[_COMMUNITY_Rate Limiting & App State|Rate Limiting & App State]]
- [[_COMMUNITY_Tiles Canvas|Tiles Canvas]]
- [[_COMMUNITY_Tiles Layout Algorithm|Tiles Layout Algorithm]]
- [[_COMMUNITY_Skeleton Loading Silhouettes|Skeleton Loading Silhouettes]]
- [[_COMMUNITY_Contract Drift-Prevention Rationale|Contract Drift-Prevention Rationale]]
- [[_COMMUNITY_Backend Health Checks|Backend Health Checks]]
- [[_COMMUNITY_Capability Provider|Capability Provider]]
- [[_COMMUNITY_Widget Merge & Ownership|Widget Merge & Ownership]]
- [[_COMMUNITY_LLM Client & Providers|LLM Client & Providers]]
- [[_COMMUNITY_Recreation Prompt Backfill|Recreation Prompt Backfill]]
- [[_COMMUNITY_OpenAI-Compat Tools|OpenAI-Compat Tools]]
- [[_COMMUNITY_Frontend Package Metadata|Frontend Package Metadata]]
- [[_COMMUNITY_Index.html Shell & Pre-Paint|Index.html Shell & Pre-Paint]]
- [[_COMMUNITY_Vercel Deploy Config|Vercel Deploy Config]]
- [[_COMMUNITY_Backend Status Banner|Backend Status Banner]]
- [[_COMMUNITY_Brand Mark & Icons|Brand Mark & Icons]]
- [[_COMMUNITY_SQL Schema Migrations|SQL Schema Migrations]]
- [[_COMMUNITY_Rate Limit & Chat Tests|Rate Limit & Chat Tests]]
- [[_COMMUNITY_Frontend Root TSConfig|Frontend Root TSConfig]]
- [[_COMMUNITY_SQL RLS Lockdown|SQL RLS Lockdown]]

## God Nodes (most connected - your core abstractions)
1. `useAgentEvents()` - 47 edges
2. `useSessionContext()` - 32 edges
3. `getDb()` - 26 edges
4. `useQueuedExplore()` - 19 edges
5. `useAgentBusy()` - 18 edges
6. `ChatPanel()` - 17 edges
7. `Tooltip()` - 16 edges
8. `scripts` - 15 edges
9. `useChartState()` - 15 edges
10. `useImagesState()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Single-Source-of-Truth Drift Prevention` --semantically_similar_to--> `SQL Schema Source-of-Truth Mirror`  [INFERRED] [semantically similar]
  shared/contract/README.md → backend/sql/README.md
- `StreamCallbacks` --references--> `CompositionPlan`  [EXTRACTED]
  backend/src/llm.ts → shared/contract/plan.ts
- `Session Two-Views-of-One-Row (deliberate non-consolidation)` --references--> `frontend useSessionList.ts Session subset`  [INFERRED]
  shared/contract/README.md → backend/sql/README.md
- `getState()` --calls--> `getDb()`  [EXTRACTED]
  backend/src/appState.ts → backend/src/db.ts
- `setState()` --calls--> `getDb()`  [EXTRACTED]
  backend/src/appState.ts → backend/src/db.ts

## Import Cycles
- 4-file cycle: `frontend/src/capabilities/widgets/Welcome/WelcomeWidget.tsx -> frontend/src/shell/AdminPage.tsx -> frontend/src/shell/AdminTabs.tsx -> frontend/src/capabilities/widgets/Welcome/index.tsx -> frontend/src/capabilities/widgets/Welcome/WelcomeWidget.tsx`
- 4-file cycle: `frontend/src/capabilities/widgets/Settings/SettingsWidget.tsx -> frontend/src/shell/AdminPage.tsx -> frontend/src/shell/AdminTabs.tsx -> frontend/src/capabilities/widgets/Settings/index.tsx -> frontend/src/capabilities/widgets/Settings/SettingsWidget.tsx`
- 4-file cycle: `frontend/src/capabilities/widgets/Health/HealthWidget.tsx -> frontend/src/shell/AdminPage.tsx -> frontend/src/shell/AdminTabs.tsx -> frontend/src/capabilities/widgets/Health/index.tsx -> frontend/src/capabilities/widgets/Health/HealthWidget.tsx`

## Hyperedges (group relationships)
- **Schema kept in sync across SQL, backend TS, and frontend TS** — sql_readme_schema_mirror, sql_readme_db_ts_mirror, sql_readme_usesessionlist_mirror [EXTRACTED 0.90]
- **Pre-paint shell seeds theme/typography mirroring runtime hooks** — index_html_pre_paint_theme, index_html_usetheme, index_html_useappearance [EXTRACTED 0.85]
- **Wire contract module unifies SSE union and render-tool specs via path alias** — contract_readme_module, contract_readme_sse, contract_readme_widgets, contract_readme_alias_path [EXTRACTED 0.90]

## Communities (60 total, 2 thin omitted)

### Community 0 - "Render Widgets & Agent Events"
Cohesion: 0.07
Nodes (56): HiddenCards, useHiddenCards(), Widget, ChartWidget(), PALETTE, paletteColor(), seriesColor(), ImagesWidget() (+48 more)

### Community 1 - "Session & Chat State"
Cohesion: 0.05
Nodes (48): CAPABILITIES, ADMIN_IDS, ADMIN_PATHS, closeAdminPage(), navigate(), parseRoute(), replaceRoute(), Route (+40 more)

### Community 2 - "Knowledge Graph Widget"
Cohesion: 0.06
Nodes (51): GraphCardSpec, Attribution(), TYPE_COLOR, TYPE_LABEL, acronymRunLength(), canonicalKey(), editDistance(), findDuplicateId() (+43 more)

### Community 3 - "Agent Diagram Widget"
Cohesion: 0.07
Nodes (31): AgentDiagramWidget(), DiagramSvg(), DiagramSvgProps, nodeColors(), NodeLabel(), NodeShapeEl(), NodeStatus, ITEMS (+23 more)

### Community 4 - "Contract: Planner & Wire Types"
Cohesion: 0.06
Nodes (38): Capability, CompositionPlan, PlanIntent, PlanRelationship, SSE_EVENT_TYPES, SseEvent, SseEventType, ChartOrientation (+30 more)

### Community 5 - "Backend Tools & Image Search"
Cohesion: 0.05
Nodes (37): arraySubject(), BUILD_KNOWLEDGE_GRAPH_TOOL, CommonsExtMeta, CommonsPage, DATA_TOOLS, fireUnsplashCreditsForRender(), ImageResult, interleave() (+29 more)

### Community 6 - "E2E Tests & Mock API"
Cohesion: 0.07
Nodes (20): DUAL_ORIENTATION, Engine, ViewportEntry, VIEWPORTS, driveScenario(), HERE, main(), ManifestShot (+12 more)

### Community 7 - "Admin & Settings Widgets"
Cohesion: 0.07
Nodes (25): DATA_SOURCE_ROWS, HealthWidget(), PROVIDER_ROWS, HealthFullResult, ProviderResult, useHealthFull(), SCREENSHOTS_WIDGET, groupByScenario() (+17 more)

### Community 8 - "Backend DB Layer"
Cohesion: 0.13
Nodes (30): assertOwner(), bumpUnsplashSearchCount(), createDb(), createSession(), DbMessage, deleteMessages(), deleteSession(), forkSession() (+22 more)

### Community 9 - "Agent Loop & JSON Salvage"
Cohesion: 0.11
Nodes (23): closeTruncatedJson(), parseBestEffort(), ApiMessage, applySelfCorrection(), Attachment, ChatMessage, emitIterationStatus(), LlmClient (+15 more)

### Community 10 - "Chat Panel & Starters"
Cohesion: 0.11
Nodes (11): DRIFT, NODES, ThinkingGlyph(), CHART_WIDGET, IMAGES_WIDGET, KNOWLEDGE_GRAPH_WIDGET, POOL, StarterPrompts() (+3 more)

### Community 11 - "Capability Tabs & Admin Nav"
Cohesion: 0.12
Nodes (12): Capability, getRenderer(), HEALTH_WIDGET, AdminPageId, useRoute(), SETTINGS_WIDGET, AdminTab(), UTILITY_TITLES (+4 more)

### Community 12 - "Agent Loop Tests"
Cohesion: 0.11
Nodes (15): __setAnthropicFactoryForTests(), __setOpenAIFactoryForTests(), aBlockStop(), aInputDelta(), aMessageDelta(), aMessageStart(), aTextBlockStart(), aTextBlockStop() (+7 more)

### Community 13 - "App Shell & Layout"
Cohesion: 0.16
Nodes (14): Wordmark(), useCapabilities(), CapabilityColumn(), MobileShell(), readCapabilitySize(), Shell(), ShellInner(), useUrlDrivenAdmin() (+6 more)

### Community 14 - "Widget State Hooks & Edit"
Cohesion: 0.12
Nodes (17): ChartContext, ChartEntry, ChartState, parseChartSpec(), VALID_TYPES, parseImagesSpec(), NOUN, PARSERS (+9 more)

### Community 15 - "Streaming Widget Providers"
Cohesion: 0.10
Nodes (12): ChartProvider(), ImagesContext, ImagesEntry, ImagesProvider(), ImagesState, TableProvider(), TimelineProvider(), StreamingEntry (+4 more)

### Community 16 - "Backend Dependencies"
Cohesion: 0.09
Nodes (22): dependencies, @anthropic-ai/sdk, hono, openai, @supabase/supabase-js, devDependencies, @biomejs/biome, @types/bun (+14 more)

### Community 17 - "Bigsail Card Specs"
Cohesion: 0.15
Nodes (10): BASE_SIZE, makeCard(), SizeHint, sizeHintFor(), SpecEntry, chartSpec, toCards(), ToCardsInput (+2 more)

### Community 18 - "Frontend Biome Config"
Cohesion: 0.09
Nodes (21): noAutofocus, noUnusedImports, noUnusedVariables, css, parser, files, includes, formatter (+13 more)

### Community 19 - "Frontend Runtime Deps"
Cohesion: 0.09
Nodes (22): dependencies, d3-force, d3-selection, d3-zoom, gridstack, lucide-react, @radix-ui/react-alert-dialog, @radix-ui/react-dropdown-menu (+14 more)

### Community 20 - "Bigsail Plan & Skeletons"
Cohesion: 0.14
Nodes (14): BigsailPlanContext, BigsailPlanProvider(), BigsailPlanState, baseSizeHint(), CardSpec, CANVAS_CAPABILITY_ORDER, capabilitiesToSkeletons(), EMPTY_SPEC (+6 more)

### Community 21 - "Backend Server & Model Registry"
Cohesion: 0.12
Nodes (11): NotOwnerError, ALLOWED_IMAGE_TYPES, app, etagMiddleware, port, READ_PATHS, ModelOption, MODELS (+3 more)

### Community 22 - "Bigsail Widget & Content"
Cohesion: 0.30
Nodes (14): BigsailLoading(), GHOST_CARDS, useBigsailPlan(), BigsailWidget(), BIGSAIL_WIDGET, useCardDuplicate(), useCapabilityContent(), useChartState() (+6 more)

### Community 23 - "Frontend Dev Dependencies"
Cohesion: 0.11
Nodes (19): devDependencies, @biomejs/biome, jsdom, @playwright/test, @tailwindcss/vite, @testing-library/react, @testing-library/user-event, @types/d3-force (+11 more)

### Community 24 - "Graph Persistence & Versioning"
Cohesion: 0.18
Nodes (11): hasSavedContent(), isGraphSnapshot(), GraphPersistenceBridge(), useKnowledgeGraphState(), SCHEMA_VERSIONS, stamp(), validate(), ValidateResult (+3 more)

### Community 25 - "Renderer Registry & App Root"
Cohesion: 0.22
Nodes (6): AGENT_DIAGRAM_WIDGET, registerRenderer(), renderers, WidgetRenderer, openAdminPage(), FirstArrivalWelcome()

### Community 26 - "Backend Biome Config"
Cohesion: 0.12
Nodes (16): noUnusedImports, noUnusedVariables, files, includes, formatter, indentStyle, indentWidth, quoteStyle (+8 more)

### Community 27 - "Widget Persistence & Guards"
Cohesion: 0.21
Nodes (11): hasSavedWidgets(), isEntryArrayOrNull(), isWidgetSnapshot(), empty, WidgetSnapshot, computeSavePayload(), EMPTY_GOOD, FieldSnapshot (+3 more)

### Community 28 - "Frontend App TSConfig"
Cohesion: 0.12
Nodes (15): compilerOptions, jsx, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess, paths (+7 more)

### Community 29 - "Backend TSConfig"
Cohesion: 0.13
Nodes (14): compilerOptions, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess, paths, skipLibCheck (+6 more)

### Community 30 - "Frontend Build Scripts"
Cohesion: 0.13
Nodes (15): scripts, build, build:app, check, check:fix, dev, preview, screenshots (+7 more)

### Community 31 - "Model Picker & Tooltip"
Cohesion: 0.17
Nodes (10): ModelOption, ModelPicker(), ModelPickerProps, Provider, PROVIDER_LABELS, useModelLabel(), useModels(), Side (+2 more)

### Community 32 - "Frontend Node TSConfig"
Cohesion: 0.15
Nodes (12): compilerOptions, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck, strict (+4 more)

### Community 33 - "Theme & Toasts"
Cohesion: 0.18
Nodes (8): ThemeChoice(), AppToaster(), ThemeToggle(), Theme, ThemeContext, ThemeContextValue, ThemeProvider(), useTheme()

### Community 34 - "Card Regeneration & Back"
Cohesion: 0.30
Nodes (10): CardBack(), nounFor(), CardRegenerate, cardSummarySeed(), entryIdOf(), NOUN, promptFieldFor(), recreationPromptOf() (+2 more)

### Community 35 - "File Attachments"
Cohesion: 0.27
Nodes (11): ACCEPTED_TYPES, AttachmentError, base64ByteLength(), filesToAttachments(), fileToAttachment(), IMAGE_TYPES, loadImage(), maybeDownscaleImage() (+3 more)

### Community 36 - "Rate Limiting & App State"
Cohesion: 0.26
Nodes (9): getState(), incrementCounter(), setState(), hourBucket(), tryConsumeChat(), hourBucket(), HOURLY_BUDGET, Source (+1 more)

### Community 37 - "Tiles Canvas"
Cohesion: 0.24
Nodes (6): BigsailCard(), Card, TilesCanvas(), TilesCanvasProps, PlacedCard, ConfirmDialog()

### Community 38 - "Tiles Layout Algorithm"
Cohesion: 0.35
Nodes (7): CardCapability, autoLayout(), clamp(), imagesSlotH(), placeCards(), pxToRows(), stackFullWidth()

### Community 39 - "Skeleton Loading Silhouettes"
Cohesion: 0.18
Nodes (4): IMAGE_TILES, SILHOUETTE, TABLE_ROWS, TIMELINE_ROWS

### Community 40 - "Contract Drift-Prevention Rationale"
Cohesion: 0.22
Nodes (11): @contract/* Path Alias Wiring, Single-Source-of-Truth Drift Prevention, shared/contract FE↔BE Wire Contract Module, Session Two-Views-of-One-Row (deliberate non-consolidation), sse.ts SseEvent Discriminated Union, widgets.ts Render-Tool Spec Types, backend/src/db.ts TS Schema Mirror, Idempotent Hand-Applied Migrations (+3 more)

### Community 41 - "Backend Health Checks"
Cohesion: 0.29
Nodes (10): checkClaude(), checkHealth(), checkKeylessHttp(), checkOpenAICompat(), checkProviders(), checkSupabase(), checkUnsplash(), HealthResult (+2 more)

### Community 42 - "Capability Provider"
Cohesion: 0.24
Nodes (7): Action, CapabilityContext, CapabilityContextValue, CapabilityProvider(), CapabilityState, initialState, setup()

### Community 43 - "Widget Merge & Ownership"
Cohesion: 0.20
Nodes (5): mergeWidgetSnapshot(), WidgetSnapshot, mutations, NotOwnerError, stored

### Community 44 - "LLM Client & Providers"
Cohesion: 0.25
Nodes (8): createClaudeClient(), createClient(), __createClientForTests, claude(), google(), providerForModel(), buildSystemPrompt(), buildTools()

### Community 45 - "Recreation Prompt Backfill"
Cohesion: 0.43
Nodes (7): backfillRecreationPrompt(), backfillSnapshotPrompts(), needsPrompt(), NOUN, promptField(), skeleton(), WidgetKind

### Community 46 - "OpenAI-Compat Tools"
Cohesion: 0.29
Nodes (6): createOpenAICompatClient(), BASE_TOOLS, capCell(), fetchOneWikipediaSummary(), stripHtml(), toOpenAITools()

### Community 47 - "Frontend Package Metadata"
Cohesion: 0.33
Nodes (5): license, name, private, type, version

### Community 48 - "Index.html Shell & Pre-Paint"
Cohesion: 0.47
Nodes (6): Pre-Paint Theme & Typography Seeding, PWA Standalone Meta Tags, viewport-fit=cover Safe-Area Insets, Aether Frontend Shell (index.html), useAppearance (TEXT_SIZE_PX/FONT_STACK), useTheme getInitialTheme()

### Community 49 - "Vercel Deploy Config"
Cohesion: 0.40
Nodes (4): buildCommand, framework, outputDirectory, rewrites

### Community 50 - "Backend Status Banner"
Cohesion: 0.60
Nodes (3): Health, useHealth(), BackendStatusBanner()

### Community 51 - "Brand Mark & Icons"
Cohesion: 0.60
Nodes (5): Aether Icon Dark Variant (magenta A on #110d1a), Aether Icon Light Variant (magenta A on #f5f2fa), Aether Brand Mark (blackletter A, magenta lotus glyph), Aether Maskable PWA Icon (safe-zone padded 512), Aether PWA / App Icon Raster Set (192/512/apple-touch)

### Community 52 - "SQL Schema Migrations"
Cohesion: 0.50
Nodes (4): 000_baseline.sql, 002_session_image_data.sql, 004_session_topic_icon.sql, 003_session_ui_state.sql

### Community 56 - "SQL RLS Lockdown"
Cohesion: 0.67
Nodes (3): 001_app_state.sql, 005_rls_lockdown.sql, Row Level Security Lockdown (service-role bypass)

## Knowledge Gaps
- **349 isolated node(s):** `$schema`, `includes`, `indentStyle`, `indentWidth`, `recommended` (+344 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

> **⚠️ Correction (2026-06-24 manual trace):** the "possible missing edges or undocumented components" framing above is **misleading**. Of the low-degree nodes, only ~150 are config/doc keys (`$schema`, `indentStyle`, JSON/markdown). The other **~308 are real `.ts`/`.tsx` symbols** — type/interface definitions (`Session`, `DbMessage`, `ProviderResult`, `HealthResult`), module constants (`READ_PATHS`, `ALLOWED_IMAGE_TYPES`, `port`), and test helpers (`fakeAnthropic`, `setClaudeEvents`, `nextClaudeEvents`). These are isolated because the **AST extractor does not emit edges for type usages or test scaffolding**, not because the code is undocumented or dead. Treat this as a **graph-extraction limitation**, not a codebase finding. No action needed.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

> **⚠️ Resolved (2026-06-24 manual trace):** the four flags below that read as *worrisome* (`useAgentEvents()` god-node, and the three "should be split?" cohesion warnings on C0/C1/C2) were all investigated against source and turned out **healthy**. They are the same pattern — one typed event bus with many subscribers, plus the size-artifact in the cohesion metric. **No action needed on any of them.** See the [Investigated Findings](#investigated-findings-2026-06-24-manual-trace) section below for the evidence. The remaining questions are still open / exploratory.

- **Why does `useAgentEvents()` connect `Render Widgets & Agent Events` to `Session & Chat State`, `Knowledge Graph Widget`, `Agent Diagram Widget`, `Chat Panel & Starters`, `Streaming Widget Providers`, `Bigsail Plan & Skeletons`, `Bigsail Widget & Content`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._ — ✅ **HEALTHY HUB** (pub/sub bus, edges point inward). Not a god object. Keep.
- **Why does `Widget` connect `Render Widgets & Agent Events` to `Agent Diagram Widget`, `Admin & Settings Widgets`, `Capability Tabs & Admin Nav`, `Bigsail Widget & Content`, `Renderer Registry & App Root`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `useSessionContext()` connect `Render Widgets & Agent Events` to `Session & Chat State`, `Chat Panel & Starters`, `Capability Tabs & Admin Nav`, `App Shell & Layout`, `Bigsail Widget & Content`, `Graph Persistence & Versioning`, `Widget Persistence & Guards`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `$schema`, `includes`, `indentStyle` to the rest of the system?**
  _353 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Render Widgets & Agent Events` be split into smaller, more focused modules?**
  _Cohesion score 0.07405515832482125 - nodes in this community are weakly interconnected._ — ✅ **NO.** Score is a size artifact (89 nodes → density falls as n²); 63% of its edges are internal. Coherent concern (turn-lifecycle bus + shared widget chrome). Do not split.
- **Should `Session & Chat State` be split into smaller, more focused modules?**
  _Cohesion score 0.05189189189189189 - nodes in this community are weakly interconnected._ — ✅ **NO** (same size-artifact; large community scores low by construction, not by incoherence).
- **Should `Knowledge Graph Widget` be split into smaller, more focused modules?**
  _Cohesion score 0.055533199195171024 - nodes in this community are weakly interconnected._ — ✅ **NO** (same size-artifact).

## Investigated Findings (2026-06-24 manual trace)
_Auto-flagged concerns traced against source. **Headline: every flag that read as worrisome turned out to be good.** Corrections to the auto-generated assumptions are marked ⚠️._

### 1. `useAgentEvents()` god-node (47 edges, betweenness 0.038) → ✅ HEALTHY HUB, keep
- It's a **pub/sub event bus**: 154 lines, public surface = `subscribe` + `emit` only ([frontend/src/shell/AgentEventContext.tsx:97-109](../frontend/src/shell/AgentEventContext.tsx#L97-L109)). Retains exactly one piece of state (`lastPhase`, for mid-turn replay); comment is explicit: "stays a pub/sub bus, not a state container."
- The 47 edges point **inward** — every capability widget consumes it; it imports none of them. Arrows converge on the bus = a **decoupling seam**, the inverse of a god object (which reaches out and orchestrates).
- Crosses 7 communities because every widget must react to the same turn lifecycle (`request_start → loop_start → tool_partial → tool_result → done`, [:19-57](../frontend/src/shell/AgentEventContext.tsx#L19-L57)). The bus collapses N×M coupling into one typed channel — high degree is the pattern working.
- Only real coupling point: the `AgentEvent` union type (a change recompiles all consumers). Acceptable — a shared contract by design, same discipline as `shared/contract`.

### 2. "Render Widgets & Agent Events" (C0, 89 nodes, cohesion 0.07) → ✅ NOT a junk drawer, do NOT split
- ⚠️ The 0.07 score is a **size/normalization artifact**, not incoherence: cohesion = edges ÷ possible edges, and possible grows as n² (89 nodes → 3,916 possible; 290/3,916 ≈ 0.074). Large communities always score low here; the 5-node SQL community scores higher for free. The "should this be split?" suggestion is the metric misfiring on size.
- **63% of C0's edges are internal** (290 intra vs 167 cross-community) — a cohesive cluster that's merely large, not noise.
- C0 is one coherent concern: the **turn-lifecycle bus** (`AgentEventContext`, `useAgentBusy`, `useToolProgress`, `useWaitingMessage`, `toolProgressScripts`, `waitingMessages`) + **shared widget chrome** (`WidgetReloadHeader`, `WidgetEmptyState`, `WidgetLoading`, `ContextMenu`, `useQueuedExplore`, `useFillFromConversation`, `useEntryReload`, `useAwaitingClarification`) + the **widget render shells**. Widget *logic* is correctly elsewhere — state hooks in C14, providers in C22, knowledge-graph logic in C2/C24. The view/state boundary was drawn correctly.
- Caveat: C0 is the natural home for new turn-reacting cross-widget behavior, so it will grow. If it ~doubles, the clean cut already exists — separate the **bus** from the **widget chrome**. Premature today.

### 3. ⚠️ "349 isolated nodes = missing edges / undocumented components" → CORRECTED: extraction limitation, not a codebase gap
- Of the low-degree nodes, only ~150 are config/doc keys. **~308 are real `.ts`/`.tsx` symbols** — type/interface defs (`Session`, `DbMessage`, `ProviderResult`, `HealthResult`), module constants (`READ_PATHS`, `ALLOWED_IMAGE_TYPES`, `port`), and test helpers (`fakeAnthropic`, `setClaudeEvents`).
- They're isolated because the **AST extractor doesn't emit edges for type usages or test scaffolding** — a graph-coverage limitation, **not** undocumented or dead code. No action needed. (An earlier verbal guess that these were "mostly benign config keys" was also wrong and is corrected here.)

### 4. Cross-heavy / outbound-heavy communities (junk-drawer hunt) → ✅ NONE found, all structural
Checked every community with the "cross-community edges ≥ internal edges" signature (the junk-drawer smell). In this codebase that signature does **not** indicate a smell — it tracks architectural *centrality*. Each cross-heavy community is a legitimate hub:
- **Composition roots:** C25 "Renderer Registry & App Root" (17 nodes, 30 intra / 94 cross, ratio 3.1 — worst) is literally `App.tsx` + `registry.ts` + every widget's registration `index.tsx`; wiring everything in is its job. C21 "Backend Server & Model Registry" is `index.ts` (Hono server entry) + `models.ts`.
- **Orchestration layer:** C22 "Bigsail Widget & Content" (52 intra / 120 cross — highest cross count) is `useCapabilityContent` + the Bigsail canvas + the widget state-hook *functions*; it assembles every widget onto the canvas, so it touches all of them by design.
- **Shared infrastructure:** C44 "LLM Client & Providers" (`createClient`/`claude`/`google`), C46 "OpenAI-Compat Tools" (really the `tools.ts` definition layer + OpenAI adapter) — high fan-in because everything uses them.
- **Bridge nodes** `Widget` (the registry interface every widget implements) and `useSessionContext()` (session context consumed app-wide) are the **same healthy hub pattern** as `useAgentEvents()` — shared contract / context types, edges converging inward.

The genuinely *internal* communities (near-zero cross) are correctly the leaf concerns: configs (Biome/tsconfig/deps), the E2E test harness (C6, 0 cross — properly isolated), brand assets, SQL migrations.

**One honest observation (not a defect):** widget **state management is split across three communities** — the hook *files* in C14 ("Widget State Hooks & Edit"), the exported hook *functions* in C22 (pulled there by their edges to the orchestration layer), and the streaming variants in C15 ("Streaming Widget Providers"). This is partly a clustering artifact, but it does reflect that per-widget state doesn't live in one tidy home — it's spread across the file, its orchestration consumer, and the streaming layer. Works fine today; just the fuzziest boundary in the graph if you ever want one clean "widget state" module.

**Bottom line: nothing in the report turned out to be bad.** Every worrisome auto-flag (god-node, three split warnings, isolated nodes, cross-heavy communities) is either a healthy pattern or a metric/extraction artifact. No action items.