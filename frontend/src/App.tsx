import { useEffect } from "react";
import {
  CapabilityProvider,
  useCapabilities,
} from "./capabilities/useCapabilities";
// Importing a widget module registers its renderer against the capability registry.
import "./capabilities/widgets/PlaceholderWidget";
import "./capabilities/widgets/AgentDiagram";
import "./capabilities/widgets/KnowledgeGraph";
import "./capabilities/widgets/Welcome";
import { WELCOME_WIDGET } from "./capabilities/widgets/Welcome";
import { KnowledgeGraphProvider } from "./capabilities/widgets/KnowledgeGraph/useKnowledgeGraphState";
import { AgentEventProvider } from "./shell/AgentEventContext";
import { BackendStatusBanner } from "./shell/BackendStatusBanner";
import { Shell } from "./shell/Shell";
import { useIsMobile } from "./shell/useIsMobile";
import { ThemeProvider } from "./theme/useTheme";

// Set once a visitor has seen the welcome panel, so it auto-opens only on the
// very first arrival. After that it's reachable from the help (?) icon.
const WELCOMED_KEY = "aether-welcomed";

// Auto-opens the Welcome widget the first time a visitor ever loads the app.
// Lives inside CapabilityProvider so it can drive the capability store.
function FirstArrivalWelcome() {
  const { open, activate } = useCapabilities();
  const isMobile = useIsMobile();
  useEffect(() => {
    // On mobile the capability widget is a full-screen overlay, so auto-opening
    // Welcome would hijack the whole first screen instead of showing the chat.
    // Skip it there — Welcome stays reachable via the (?) icon. Don't set the
    // flag yet, so a later desktop visit still gets the auto-welcome once.
    if (isMobile) return;
    if (localStorage.getItem(WELCOMED_KEY)) return;
    localStorage.setItem(WELCOMED_KEY, "true");
    open(WELCOME_WIDGET);
    activate(WELCOME_WIDGET.id);
  }, [open, activate, isMobile]);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <BackendStatusBanner />
      <AgentEventProvider>
        {/* Subscribes to the bus at the root so the graph never misses a
            build_knowledge_graph payload — the widget can mount after the first
            one arrives. */}
        <KnowledgeGraphProvider>
          <CapabilityProvider>
            <FirstArrivalWelcome />
            <Shell />
          </CapabilityProvider>
        </KnowledgeGraphProvider>
      </AgentEventProvider>
    </ThemeProvider>
  );
}
