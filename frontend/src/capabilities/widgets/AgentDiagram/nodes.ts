// Pure layout data for the agent-loop diagram. No React, no state — just the
// fixed topology: where each node sits, what shape it is, how edges connect them.
// The diagram is a known, hand-authored graph, so coordinates are hardcoded
// rather than computed by a layout engine.

export type NodeId =
  | "user"
  | "http_post"
  | "build_history"
  | "claude_api"
  | "stream_tokens"
  | "token_append"
  | "stop_reason"
  | "tool_exec"
  | "external_data"
  | "feed_results"
  | "done";

// Which of the three runtime zones a node lives on. Drives its active colour and
// teaches the architecture: blue = browser (frontend), green/amber = our server
// (backend), purple/orange = systems we call out to (external).
export type Role =
  | "frontend"
  | "backend"
  | "claude"
  | "tool"
  | "done"
  | "external";

export type NodeShape = "rect" | "round" | "diamond";

export interface DiagramNode {
  id: NodeId;
  label: string;
  sub?: string; // small mono caption under the label (the real code symbol)
  shape: NodeShape;
  role: Role;
  x: number; // top-left
  y: number;
  w: number;
  h: number;
}

// ── Canvas ────────────────────────────────────────────────────────────────
// Three equal 280-wide zones: FRONTEND | BACKEND | EXTERNAL.
export const VIEW_W = 840;
// Vertical room reserved at the top for the two-line zone headers.
export const HEADER_H = 64;
// Content bottoms out at the agent-loop box (~730); a small margin past it.
export const VIEW_H = 680 + HEADER_H;
// The two dashed dividers between the three zones.
export const DIVIDER_X1 = 280;
export const DIVIDER_X2 = 560;

const NW = 156; // standard node width
const NH = 46; // standard node height

// Column centre lines. Exported so the zone headers (in DiagramSvg) sit over
// the real columns rather than the midpoint of each zone.
export const FE = 140; // frontend column centre x
export const BE = 420; // backend column centre x
export const EX = 700; // external column centre x

// Helper: a node centred on column `cx` at vertical `y`. Every node is pushed
// down by HEADER_H so the larger wrapped headers have clear space above.
function n(
  id: NodeId,
  label: string,
  role: Role,
  cx: number,
  y: number,
  opts: { sub?: string; shape?: NodeShape; w?: number; h?: number } = {}
): DiagramNode {
  const w = opts.w ?? NW;
  const h = opts.h ?? NH;
  return {
    id,
    label,
    role,
    sub: opts.sub,
    shape: opts.shape ?? "rect",
    x: cx - w / 2,
    y: y + HEADER_H,
    w,
    h,
  };
}

export const NODES: DiagramNode[] = [
  n("user", "User", "frontend", FE, 28, {
    shape: "round",
    sub: "your message",
  }),
  n("http_post", "POST /api/chat", "frontend", FE, 110, { sub: "fetch()" }),
  n("build_history", "Build history", "backend", BE, 110, {
    sub: "messages → API",
  }),
  n("claude_api", "Chosen LLM", "claude", EX, 210, {
    sub: "messages.stream()",
  }),
  n("stream_tokens", "Stream tokens", "backend", BE, 300, {
    sub: "text_delta → SSE",
  }),
  n("token_append", "Append token", "frontend", FE, 300, {
    sub: "setMessages()",
  }),
  n("stop_reason", "stop_reason?", "backend", BE, 408, {
    shape: "diamond",
    w: 150,
    h: 84,
  }),
  n("tool_exec", "executeTool()", "tool", BE, 522, { sub: "run the tool" }),
  n("external_data", "External data", "external", EX, 522, {
    sub: "Wikidata · World Bank · …",
  }),
  n("feed_results", "Feed results", "backend", BE, 600, {
    sub: "history.push()",
  }),
  n("done", "onDone() · [DONE]", "done", FE, 600, { sub: "stream closes" }),
];

export const NODE_BY_ID: Record<NodeId, DiagramNode> = Object.fromEntries(
  NODES.map((node) => [node.id, node])
) as Record<NodeId, DiagramNode>;

// ── Edges ───────────────────────────────────────────────────────────────────
// `flowOn` lists the node statuses during which this edge is "live" (animated
// dashes flowing along it). An edge is live when its downstream node is active.
export interface DiagramEdge {
  id: string;
  from: NodeId;
  to: NodeId;
  // The activating node — edge animates while this node is active.
  activeWhen: NodeId;
  // Optional label rendered at the edge midpoint (e.g. the stop_reason branches).
  label?: string;
  // Hand-authored path. If omitted, a straight centre-to-centre line is drawn.
  d?: string;
  // A loop-back edge gets the slower, more prominent "looping" animation.
  loop?: boolean;
}

// Anchor helpers for hand-drawn paths.
const cx = (id: NodeId) => NODE_BY_ID[id].x + NODE_BY_ID[id].w / 2;
const top = (id: NodeId) => NODE_BY_ID[id].y;
const bottom = (id: NodeId) => NODE_BY_ID[id].y + NODE_BY_ID[id].h;
const left = (id: NodeId) => NODE_BY_ID[id].x;
const right = (id: NodeId) => NODE_BY_ID[id].x + NODE_BY_ID[id].w;
const midY = (id: NodeId) => NODE_BY_ID[id].y + NODE_BY_ID[id].h / 2;

export const EDGES: DiagramEdge[] = [
  // User → POST (straight down, frontend)
  {
    id: "user-post",
    from: "user",
    to: "http_post",
    activeWhen: "http_post",
    d: `M ${cx("user")} ${bottom("user")} L ${cx("http_post")} ${top("http_post")}`,
  },
  // POST → Build history (crosses the divide, frontend → backend)
  {
    id: "post-build",
    from: "http_post",
    to: "build_history",
    activeWhen: "build_history",
    d: `M ${right("http_post")} ${midY("http_post")} L ${left("build_history")} ${midY("build_history")}`,
  },
  // Build history → Claude API (reaches OUT of backend into the external column)
  {
    id: "build-claude",
    from: "build_history",
    to: "claude_api",
    activeWhen: "claude_api",
    d: `M ${right("build_history")} ${midY("build_history")} L ${left("claude_api")} ${midY("claude_api")}`,
  },
  // Claude API → Stream tokens (model streams back INTO the backend)
  {
    id: "claude-stream",
    from: "claude_api",
    to: "stream_tokens",
    activeWhen: "stream_tokens",
    d: `M ${left("claude_api")} ${midY("claude_api")} L ${right("stream_tokens")} ${midY("stream_tokens")}`,
  },
  // Stream tokens → Append token (crosses divide back to frontend, token flow)
  {
    id: "stream-append",
    from: "stream_tokens",
    to: "token_append",
    activeWhen: "token_append",
    d: `M ${left("stream_tokens")} ${midY("stream_tokens")} L ${right("token_append")} ${midY("token_append")}`,
  },
  // Claude API → stop_reason (down the backend spine; runs alongside streaming)
  {
    id: "stream-stop",
    from: "stream_tokens",
    to: "stop_reason",
    activeWhen: "stop_reason",
    d: `M ${cx("stream_tokens")} ${bottom("stream_tokens")} L ${cx("stop_reason")} ${top("stop_reason")}`,
  },
  // stop_reason → tool_exec  (the "tool_use" branch, down)
  {
    id: "stop-tool",
    from: "stop_reason",
    to: "tool_exec",
    activeWhen: "tool_exec",
    label: "tool_use",
    d: `M ${cx("stop_reason")} ${bottom("stop_reason")} L ${cx("tool_exec")} ${top("tool_exec")}`,
  },
  // stop_reason → done  (the "end_turn" branch, crosses to frontend)
  {
    id: "stop-done",
    from: "stop_reason",
    to: "done",
    activeWhen: "done",
    label: "end_turn",
    // Out the left of the diamond, down, and across into the done node.
    d: `M ${left("stop_reason")} ${midY("stop_reason")} L ${left("stop_reason") - 40} ${midY("stop_reason")} L ${left("stop_reason") - 40} ${midY("done")} L ${right("done")} ${midY("done")}`,
  },
  // tool_exec → external_data (the tool reaches OUT to data providers; the result
  // comes back and continues down via tool-feed)
  {
    id: "tool-external",
    from: "tool_exec",
    to: "external_data",
    activeWhen: "tool_exec",
    d: `M ${right("tool_exec")} ${midY("tool_exec")} L ${left("external_data")} ${midY("external_data")}`,
  },
  // tool_exec → feed_results (down)
  {
    id: "tool-feed",
    from: "tool_exec",
    to: "feed_results",
    activeWhen: "feed_results",
    d: `M ${cx("tool_exec")} ${bottom("tool_exec")} L ${cx("feed_results")} ${top("feed_results")}`,
  },
  // feed_results → build_history  (THE LOOP-BACK — out right, up, into build_history's right side)
  {
    id: "feed-loop",
    from: "feed_results",
    to: "build_history",
    activeWhen: "build_history",
    loop: true,
    d: `M ${right("feed_results")} ${midY("feed_results")} L ${right("feed_results") + 38} ${midY("feed_results")} L ${right("feed_results") + 38} ${midY("build_history")} L ${right("build_history")} ${midY("build_history")}`,
  },
];

// ── Loop containers ──────────────────────────────────────────────────────────
// Dashed rectangles that visually group the two while-loops. Drawn behind nodes.
export interface LoopBox {
  id: "agent_loop" | "sse_loop";
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const LOOP_BOXES: LoopBox[] = [
  {
    id: "agent_loop",
    label: "agent loop · while (true)",
    x: BE - 110,
    y: 188 + HEADER_H,
    w: 220,
    h: 478,
  },
  {
    id: "sse_loop",
    label: "SSE read loop · while (read)",
    x: FE - 100,
    y: 278 + HEADER_H,
    w: 200,
    h: 88,
  },
];

// ── Colours per role ──────────────────────────────────────────────────────────
// Idle is shared; active/glow colour keys off the role. Hex values double as the
// CSS custom property `--node-color` so the pulse drop-shadow matches.
// 80s punk / synthwave palette, anchored on the app's neon tokens (--neon-cyan
// #16c2ff, --neon-pink #ff2e9a in index.css) and extended with synthwave purple,
// acid green, and electric yellow.
export const ROLE_COLOR: Record<Role, string> = {
  frontend: "#16c2ff", // neon cyan (app token) — the browser side
  backend: "#00f0a8", // acid green — server / loop
  claude: "#c026ff", // synthwave purple — the model (external)
  tool: "#ffd400", // electric yellow — tool execution
  done: "#ff2e9a", // neon pink (app token) — terminal / done
  external: "#ff7849", // synthwave orange — external data providers
};
