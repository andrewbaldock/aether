import * as RadixTooltip from "@radix-ui/react-tooltip";
import { useEffect } from "react";
import {
  CapabilityProvider,
  useCapabilities,
} from "./capabilities/useCapabilities";
// Importing a widget module registers its renderer against the capability registry.
import "./capabilities/widgets/PlaceholderWidget";
import "./capabilities/widgets/AgentDiagram";
import "./capabilities/widgets/Bigsail";
import "./capabilities/widgets/Chart";
import "./capabilities/widgets/Health";
import "./capabilities/widgets/Images";
import "./capabilities/widgets/KnowledgeGraph";
import "./capabilities/widgets/Settings";
import "./capabilities/widgets/Table";
import "./capabilities/widgets/Timeline";
import "./capabilities/widgets/Welcome";
import { BigsailPlanProvider } from "./capabilities/widgets/Bigsail/BigsailPlanProvider";
import { ChartProvider } from "./capabilities/widgets/Chart/useChartState";
import { ImagesProvider } from "./capabilities/widgets/Images/useImagesState";
import { KnowledgeGraphProvider } from "./capabilities/widgets/KnowledgeGraph/useKnowledgeGraphState";
import { TableProvider } from "./capabilities/widgets/Table/useTableState";
import { TimelineProvider } from "./capabilities/widgets/Timeline/useTimelineState";
import { WELCOME_WIDGET } from "./capabilities/widgets/Welcome";
import { AgentEventProvider } from "./shell/AgentEventContext";
import { BackendStatusBanner } from "./shell/BackendStatusBanner";
import { Shell } from "./shell/Shell";
import { useIsMobile } from "./shell/useIsMobile";
import { AppearanceProvider } from "./theme/useAppearance";
import { ThemeProvider } from "./theme/useTheme";

// Set once a visitor has seen the welcome panel, so it auto-opens only on the
// very first arrival. After that it's reachable from the help (?) icon.
const WELCOMED_KEY = "aether-welcomed";

// Auto-opens the Welcome widget the first time a visitor ever loads the app.
// Lives inside CapabilityProvider so it can drive the capability store.
function FirstArrivalWelcome() {
  const { activate } = useCapabilities();
  const isMobile = useIsMobile();
  useEffect(() => {
    // On mobile the capability column is a full-screen overlay, so auto-opening
    // Welcome would hijack the whole first screen instead of showing the chat.
    // Skip it there — Welcome stays reachable via the (?) icon. Don't set the
    // flag yet, so a later desktop visit still gets the auto-welcome once.
    if (isMobile) return;
    if (localStorage.getItem(WELCOMED_KEY)) return;
    localStorage.setItem(WELCOMED_KEY, "true");
    activate(WELCOME_WIDGET.id);
  }, [activate, isMobile]);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <AppearanceProvider>
        {/* One shared tooltip provider for the whole app, so Radix can coordinate
          hover timing (skip the open-delay when moving between adjacent
          tooltips). */}
        <RadixTooltip.Provider delayDuration={300} skipDelayDuration={150}>
          <BackendStatusBanner />
          <AgentEventProvider>
            {/* Stores the latest composition plan from the bus so Bigsail (which
            mounts late) never misses one. Mounted at the root like the render-tool
            providers; the only new provider Bigsail needs. */}
            <BigsailPlanProvider>
              {/* Subscribes to the bus at the root so the graph never misses a
            build_knowledge_graph payload — the widget can mount after the first
            one arrives. */}
              <KnowledgeGraphProvider>
                {/* Latest-wins render-tool providers — each stores the most recent
                spec from its tool_result and is mounted at the root so it never
                misses one (the widget tab mounts only after the spec lands). */}
                <TableProvider>
                  <ChartProvider>
                    <TimelineProvider>
                      <ImagesProvider>
                        <CapabilityProvider>
                          <FirstArrivalWelcome />
                          <Shell />
                        </CapabilityProvider>
                      </ImagesProvider>
                    </TimelineProvider>
                  </ChartProvider>
                </TableProvider>
              </KnowledgeGraphProvider>
            </BigsailPlanProvider>
          </AgentEventProvider>
        </RadixTooltip.Provider>
      </AppearanceProvider>
    </ThemeProvider>
  );
}
