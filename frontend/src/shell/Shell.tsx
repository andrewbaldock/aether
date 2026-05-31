import { Group, Panel, Separator } from "react-resizable-panels";
import { useCapabilities } from "../capabilities/useCapabilities";
import { CapabilityColumn } from "./CapabilityColumn";
import { ChatPanel } from "./ChatPanel";
import { Sidebar } from "./Sidebar";

const handle =
  "w-1 bg-neutral-800 transition-colors hover:bg-neutral-600 data-[separator-state=hover]:bg-neutral-600 data-[separator-state=drag]:bg-neutral-500";

// The three-zone shell. The capability store decides which of the three states renders:
// chat-only · split · capability-fullscreen.
export function Shell() {
  const { isOpen, isFullscreen } = useCapabilities();

  return (
    <div className="h-screen w-screen overflow-hidden bg-neutral-900">
      <Group orientation="horizontal">
        {/* Sidebar — resizable + collapsible. v4: bare numbers = px, strings = percentages.
            Fixed-width feel: px sizing so it doesn't grow on large screens. */}
        <Panel
          defaultSize={240}
          minSize={180}
          maxSize={300}
          collapsible
          collapsedSize={0}
        >
          <Sidebar />
        </Panel>
        <Separator className={handle} />

        {/* Chat — hidden when a capability is fullscreen */}
        {!isFullscreen && (
          <>
            <Panel defaultSize={isOpen ? "50%" : "82%"} minSize="30%">
              <ChatPanel />
            </Panel>
            {isOpen && <Separator className={handle} />}
          </>
        )}

        {/* Capability column — present whenever a widget is open */}
        {isOpen && (
          <Panel defaultSize={isFullscreen ? "82%" : "32%"} minSize="20%">
            <CapabilityColumn />
          </Panel>
        )}
      </Group>
    </div>
  );
}
