import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type AgentEvent,
  useAgentEvents,
} from "../../../shell/AgentEventContext";
import type { CompositionPlan } from "./plan";

// Stores the LATEST composition plan emitted on the bus. The bus is stateless and
// Bigsail mounts late (its tab only exists once it's the active view), so a plan
// event fired mid-turn would be missed without a root subscriber. This provider —
// mounted at the app root like the render-tool providers — subscribes once and
// keeps the most recent plan so BigsailWidget can read it whenever it mounts. This
// is the ONLY new provider Bigsail needs; a future superskill adds its own bus
// subscription with zero planner changes.

interface BigsailPlanState {
  plan: CompositionPlan | null;
}

const BigsailPlanContext = createContext<BigsailPlanState | null>(null);

export function BigsailPlanProvider({ children }: { children: ReactNode }) {
  const bus = useAgentEvents();
  const [plan, setPlan] = useState<CompositionPlan | null>(null);

  useEffect(() => {
    function handle(event: AgentEvent) {
      if (event.type !== "plan") return;
      setPlan(event.plan);
    }
    return bus.subscribe(handle);
  }, [bus]);

  const value = useMemo<BigsailPlanState>(() => ({ plan }), [plan]);

  return (
    <BigsailPlanContext.Provider value={value}>
      {children}
    </BigsailPlanContext.Provider>
  );
}

// Reads the latest plan. Returns null outside a provider rather than throwing, so
// Bigsail degrades to masonry/un-planned flowchart if the provider is ever absent.
export function useBigsailPlan(): CompositionPlan | null {
  return useContext(BigsailPlanContext)?.plan ?? null;
}
