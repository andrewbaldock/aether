import {
  DIVIDER_X,
  type DiagramEdge,
  type DiagramNode,
  EDGES,
  LOOP_BOXES,
  NODE_BY_ID,
  NODES,
  type NodeId,
  ROLE_COLOR,
  VIEW_H,
  VIEW_W,
} from "./nodes";

// One node's animation state. Drives the `data-status` attribute that the CSS
// keyframes hang off.
export type NodeStatus = "idle" | "active" | "complete" | "looping";

export interface DiagramSvgProps {
  nodeStatuses: Record<NodeId, NodeStatus>;
  loopCount: number;
  activeToolName: string | null;
}

// Structural colours track the theme via the semantic CSS vars (see index.css);
// role colours (ROLE_COLOR) and the green loop glow stay fixed — they're status
// identity, not surfaces.
const IDLE_FILL = "var(--elevated)"; // was neutral-800
const IDLE_STROKE = "var(--border-strong)"; // was neutral-700
const COMPLETE_STROKE = "var(--content-subtle)"; // was zinc-600

// Resolve the colour for a node given its status. Active/looping use the role
// colour; idle/complete are neutral. The role hex is also written to --node-color
// so the pulse drop-shadow (CSS) glows in the matching hue.
function nodeColors(node: DiagramNode, status: NodeStatus) {
  const role = ROLE_COLOR[node.role];
  switch (status) {
    case "active":
    case "looping":
      return {
        fill: "var(--surface)",
        stroke: role,
        text: "var(--content)",
        glow: role,
      };
    case "complete":
      return {
        fill: "var(--surface)",
        stroke: COMPLETE_STROKE,
        text: "var(--content-muted)",
        glow: role,
      };
    default:
      return {
        fill: IDLE_FILL,
        stroke: IDLE_STROKE,
        text: "var(--content-subtle)",
        glow: role,
      };
  }
}

function NodeShapeEl({
  node,
  status,
}: {
  node: DiagramNode;
  status: NodeStatus;
}) {
  const c = nodeColors(node, status);
  const common = {
    fill: c.fill,
    stroke: c.stroke,
    strokeWidth: status === "active" || status === "looping" ? 2 : 1.25,
  };

  if (node.shape === "diamond") {
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    const points = `${cx},${node.y} ${node.x + node.w},${cy} ${cx},${node.y + node.h} ${node.x},${cy}`;
    return <polygon points={points} {...common} />;
  }

  const rx = node.shape === "round" ? node.h / 2 : 10;
  return (
    <rect
      x={node.x}
      y={node.y}
      width={node.w}
      height={node.h}
      rx={rx}
      {...common}
    />
  );
}

function NodeLabel({
  node,
  status,
}: {
  node: DiagramNode;
  status: NodeStatus;
}) {
  const c = nodeColors(node, status);
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const hasSub = Boolean(node.sub);
  return (
    <g className="pointer-events-none select-none">
      <text
        x={cx}
        y={hasSub ? cy - 3 : cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13}
        fontWeight={600}
        fill={c.text}
      >
        {node.label}
      </text>
      {hasSub && (
        <text
          x={cx}
          y={cy + 13}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={9.5}
          fontFamily="ui-monospace, monospace"
          fill={
            status === "idle" ? "var(--content-faint)" : "var(--content-subtle)"
          }
        >
          {node.sub}
        </text>
      )}
    </g>
  );
}

function Edge({ edge, status }: { edge: DiagramEdge; status: NodeStatus }) {
  const target = NODE_BY_ID[edge.activeWhen];
  const live = status === "active" || status === "looping";
  const color = ROLE_COLOR[target.role];
  const d =
    edge.d ??
    `M ${NODE_BY_ID[edge.from].x} ${NODE_BY_ID[edge.from].y} L ${NODE_BY_ID[edge.to].x} ${NODE_BY_ID[edge.to].y}`;

  return (
    <g>
      {/* The static base line. */}
      <path
        d={d}
        fill="none"
        stroke={live ? color : "var(--border-strong)"}
        strokeWidth={live ? 2 : 1.25}
        markerEnd={`url(#arrow-${live ? "live" : "idle"})`}
        className="agent-edge"
        data-status={status}
        style={
          live ? ({ "--edge-color": color } as React.CSSProperties) : undefined
        }
      />
      {/* The flowing dash overlay, only when live. */}
      {live && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray="6 10"
          strokeLinecap="round"
          className={edge.loop ? "agent-edge-flow-loop" : "agent-edge-flow"}
        />
      )}
      {edge.label && <EdgeLabel edge={edge} d={d} live={live} color={color} />}
    </g>
  );
}

// Render an edge's branch label near its start (used for the stop_reason
// branches). Approximate position: a little past the source node.
function EdgeLabel({
  edge,
  live,
  color,
}: {
  edge: DiagramEdge;
  d: string;
  live: boolean;
  color: string;
}) {
  const src = NODE_BY_ID[edge.from];
  const tgt = NODE_BY_ID[edge.to];
  // Place near the midpoint of source-bottom → target-top.
  const x = (src.x + src.w / 2 + tgt.x + tgt.w / 2) / 2;
  const y = (src.y + src.h + tgt.y) / 2;
  // Nudge the end_turn label leftwards (it exits the diamond's left).
  const lx = edge.label === "end_turn" ? src.x - 20 : x;
  const ly = edge.label === "end_turn" ? src.y + src.h / 2 + 12 : y;
  return (
    <text
      x={lx}
      y={ly}
      textAnchor="middle"
      fontSize={9}
      fontFamily="ui-monospace, monospace"
      fontWeight={600}
      fill={live ? color : "var(--content-faint)"}
    >
      {edge.label}
    </text>
  );
}

export function DiagramSvg({
  nodeStatuses,
  loopCount,
  activeToolName,
}: DiagramSvgProps) {
  const agentBox = LOOP_BOXES.find((b) => b.id === "agent_loop");
  const toolNode = NODE_BY_ID.tool_exec;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="h-full w-full"
      role="img"
      aria-label="Live diagram of Aether's agent loop"
    >
      <defs>
        <marker
          id="arrow-idle"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
        </marker>
        <marker
          id="arrow-live"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--content-muted)" />
        </marker>
      </defs>

      {/* Frontend / Backend divider + headers */}
      <line
        x1={DIVIDER_X}
        y1={8}
        x2={DIVIDER_X}
        y2={VIEW_H - 8}
        stroke="var(--border)"
        strokeWidth={1}
        strokeDasharray="2 6"
      />
      <text
        x={DIVIDER_X / 2}
        y={26}
        textAnchor="middle"
        fontSize={15}
        fontWeight={700}
        letterSpacing={1}
        fill="var(--content-faint)"
      >
        <tspan x={DIVIDER_X / 2} dy="0">
          FRONTEND
        </tspan>
        <tspan x={DIVIDER_X / 2} dy="22">
          · browser
        </tspan>
      </text>
      <text
        x={DIVIDER_X + (VIEW_W - DIVIDER_X) / 2}
        y={26}
        textAnchor="middle"
        fontSize={15}
        fontWeight={700}
        letterSpacing={1}
        fill="var(--content-faint)"
      >
        <tspan x={DIVIDER_X + (VIEW_W - DIVIDER_X) / 2} dy="0">
          BACKEND
        </tspan>
        <tspan x={DIVIDER_X + (VIEW_W - DIVIDER_X) / 2} dy="22">
          · Bun server
        </tspan>
      </text>

      {/* Loop containers (behind nodes) */}
      {LOOP_BOXES.map((box) => {
        const looping =
          box.id === "agent_loop" &&
          (nodeStatuses.build_history === "looping" ||
            nodeStatuses.feed_results === "active");
        return (
          <g key={box.id}>
            <rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              rx={12}
              fill="none"
              stroke={looping ? ROLE_COLOR.backend : "var(--border)"}
              strokeWidth={1.25}
              strokeDasharray="5 5"
              className="agent-loop-box"
              data-looping={looping}
            />
            <text
              x={box.x + 10}
              y={box.y - 6}
              fontSize={9.5}
              fontFamily="ui-monospace, monospace"
              fontWeight={600}
              fill="var(--content-faint)"
            >
              {box.label}
            </text>
          </g>
        );
      })}

      {/* Loop-iteration counter badge on the agent-loop box */}
      {agentBox && loopCount > 0 && (
        <g>
          <rect
            x={agentBox.x + agentBox.w - 44}
            y={agentBox.y - 14}
            width={40}
            height={20}
            rx={10}
            fill="var(--surface)"
            stroke={ROLE_COLOR.backend}
            strokeWidth={1.25}
          />
          <text
            x={agentBox.x + agentBox.w - 24}
            y={agentBox.y - 1}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fontFamily="ui-monospace, monospace"
            fill={ROLE_COLOR.backend}
          >
            ×{loopCount}
          </text>
        </g>
      )}

      {/* Edges (under nodes) */}
      {EDGES.map((edge) => (
        <Edge
          key={edge.id}
          edge={edge}
          status={nodeStatuses[edge.activeWhen]}
        />
      ))}

      {/* Nodes */}
      {NODES.map((node) => {
        const status = nodeStatuses[node.id];
        const c = nodeColors(node, status);
        return (
          <g
            key={node.id}
            className="agent-node"
            data-status={status}
            style={{ "--node-color": c.glow } as React.CSSProperties}
          >
            <NodeShapeEl node={node} status={status} />
            <NodeLabel node={node} status={status} />
          </g>
        );
      })}

      {/* Active tool name caption under executeTool */}
      {activeToolName && (
        <text
          x={toolNode.x + toolNode.w / 2}
          y={toolNode.y + toolNode.h + 14}
          textAnchor="middle"
          fontSize={10}
          fontFamily="ui-monospace, monospace"
          fill={ROLE_COLOR.tool}
        >
          {activeToolName}()
        </text>
      )}
    </svg>
  );
}
