import { CapabilityProvider } from "./capabilities/useCapabilities";
// Importing a widget module registers its renderer against the capability registry.
import "./capabilities/widgets/PlaceholderWidget";
import "./capabilities/widgets/AgentDiagram";
import { AgentEventProvider } from "./shell/AgentEventContext";
import { Shell } from "./shell/Shell";
import { ThemeProvider } from "./theme/useTheme";

export default function App() {
  return (
    <ThemeProvider>
      <AgentEventProvider>
        <CapabilityProvider>
          <Shell />
        </CapabilityProvider>
      </AgentEventProvider>
    </ThemeProvider>
  );
}
