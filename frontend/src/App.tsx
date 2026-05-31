import { CapabilityProvider } from "./capabilities/useCapabilities";
// Importing a widget module registers its renderer against the capability registry.
import "./capabilities/widgets/PlaceholderWidget";
import { Shell } from "./shell/Shell";

export default function App() {
  return (
    <CapabilityProvider>
      <Shell />
    </CapabilityProvider>
  );
}
