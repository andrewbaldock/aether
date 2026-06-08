// Integration tests for the additive-merge reducer's deduplication: drive real
// build_knowledge_graph tool_result events through the agent bus and assert the
// graph folds slug-drift / fuzzy duplicates into a single node instead of adding
// twins, re-pointing their links to the survivor. Complements dedup.test.ts (which
// covers the pure matching functions) by exercising the wiring in
// useKnowledgeGraphState.

import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  type AgentEventBus,
  AgentEventProvider,
  useAgentEvents,
} from "../../../shell/AgentEventContext";
import type { GraphLink } from "./types";
import {
  KnowledgeGraphProvider,
  useKnowledgeGraphState,
} from "./useKnowledgeGraphState";

// Render the graph provider inside a real event bus and expose both the graph
// state and the bus so a test can emit tool_results and read the resulting graph.
function setup() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AgentEventProvider>
      <KnowledgeGraphProvider>{children}</KnowledgeGraphProvider>
    </AgentEventProvider>
  );
  return renderHook(
    () => ({
      graph: useKnowledgeGraphState(),
      bus: useAgentEvents(),
    }),
    { wrapper }
  );
}

// Emit a build_knowledge_graph tool_result carrying the given payload.
function emitGraph(bus: AgentEventBus, payload: unknown) {
  act(() => {
    bus.emit({
      type: "tool_result",
      tool: "build_knowledge_graph",
      result: JSON.stringify(payload),
    });
  });
}

function endpointIds(link: GraphLink): [string, string] {
  const from = typeof link.source === "string" ? link.source : link.source.id;
  const to = typeof link.target === "string" ? link.target : link.target.id;
  return [from, to];
}

describe("knowledge graph dedup (integration)", () => {
  it("folds a slug-drift duplicate into the existing node and re-points its link", () => {
    const { result } = setup();
    const { bus } = result.current;

    emitGraph(bus, {
      entities: [
        { id: "marie-curie", label: "Marie Curie", type: "person" },
        { id: "radioactivity", label: "Radioactivity", type: "concept" },
      ],
      relationships: [
        { from: "marie-curie", to: "radioactivity", label: "studied" },
      ],
    });

    // Second turn re-introduces Curie under a drifted id + fuller name, and links
    // her to a new entity.
    emitGraph(bus, {
      entities: [
        {
          id: "marie-sklodowska-curie",
          label: "Marie Skłodowska Curie",
          type: "person",
        },
        { id: "nobel-prize", label: "Nobel Prize", type: "concept" },
      ],
      relationships: [
        { from: "marie-sklodowska-curie", to: "nobel-prize", label: "won" },
      ],
    });

    const { nodes, links } = result.current.graph;
    // One Curie, not two: marie-curie + radioactivity + nobel-prize = 3 nodes.
    expect(nodes.map((n) => n.id).sort()).toEqual([
      "marie-curie",
      "nobel-prize",
      "radioactivity",
    ]);
    // The drifted entity's link attaches to the surviving id.
    const wonLink = links.find((l) => endpointIds(l)[1] === "nobel-prize");
    expect(wonLink && endpointIds(wonLink)[0]).toBe("marie-curie");
  });

  it("folds a fuzzy same-type duplicate (acronym expansion)", () => {
    const { result } = setup();
    const { bus } = result.current;

    emitGraph(bus, {
      entities: [{ id: "us-army", label: "US Army", type: "org" }],
      relationships: [],
    });
    emitGraph(bus, {
      entities: [
        { id: "united-states-army", label: "United States Army", type: "org" },
      ],
      relationships: [],
    });

    expect(result.current.graph.nodes.map((n) => n.id)).toEqual(["us-army"]);
  });

  it("keeps same-name entities of different types as separate nodes", () => {
    const { result } = setup();
    const { bus } = result.current;

    emitGraph(bus, {
      entities: [
        { id: "mercury-planet", label: "Mercury", type: "place" },
        { id: "mercury-god", label: "Mercury", type: "person" },
      ],
      relationships: [],
    });

    expect(result.current.graph.nodes).toHaveLength(2);
  });
});
