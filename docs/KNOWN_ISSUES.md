# Known Issues

Known rough edges, not yet fixed. Tagged `website:` for the portfolio site; untagged = Aether app.

## Aether

- **Explore further not working on mobile** — the "explore further" affordance is a right-click context menu (`WithContextMenu` → `onContextMenu`), which never fires on touch. Best fixed by the **shared menu/select primitive** in [ROADMAP.md](./ROADMAP.md) (one Radix dropdown replaces this menu, the sidebar kebab, and — via Radix select — the model picker), rather than patching the context menu alone.
- **No mobile portrait layout** — on portrait/mobile, the conversation and capability columns should stack vertically instead of sitting side by side.
- **Incomplete mobile affordance scan** — sweep for any remaining hover-only controls that still need touch equivalents. (Sidebar rename/delete and the conversation-title edit affordance are now touch-visible; the send/stop control too — but the full audit isn't finished.)
- **Welcome panel's live agent diagram is dead when opened mid-query** — the Welcome/help panel's centerpiece is the live `AgentDiagramWidget` (the agent loop lighting up as a turn runs). If you open it *while* a query is already in flight, it sits all-idle and never picks up the running turn — it only animates for turns that start after it's open. Root cause: the diagram derives entirely from the stateless `AgentEventBus`, so a subscriber mounting mid-turn misses the events that already fired. Fix: have the bus replay its most-recent coarse phase to new subscribers so the diagram catches up.
- **"Working" dialogs don't name the active tool** — the in-progress status should say which tool/data source is running right now, not a generic "working" message.
- **Tool-update buttons disabled while chat is working** — the per-tool update/action buttons grey out for the duration of an in-flight turn. They shouldn't block: queue the action and fire it once the current turn settles, rather than disabling the control.

## Website

- **Needs better marketing assets** — better screenshots, updated copy, GIFs, and screen captures of the mobile experience in action.
