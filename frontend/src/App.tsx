import { CapabilityProvider } from "./capabilities/useCapabilities";
// Importing a widget module registers its renderer against the capability registry.
import "./capabilities/widgets/PlaceholderWidget";
import "./capabilities/widgets/AgentDiagram";
import "./capabilities/widgets/KnowledgeGraph";
import { KnowledgeGraphProvider } from "./capabilities/widgets/KnowledgeGraph/useKnowledgeGraphState";
import { AgentEventProvider } from "./shell/AgentEventContext";
import { BackendStatusBanner } from "./shell/BackendStatusBanner";
import { Shell } from "./shell/Shell";
import { ThemeProvider } from "./theme/useTheme";

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
            <Shell />
          </CapabilityProvider>
        </KnowledgeGraphProvider>
      </AgentEventProvider>
    </ThemeProvider>
  );
}
