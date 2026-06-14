# Known Issues

Known rough edges, not yet fixed. Tagged `website:` for the portfolio site; untagged = Aether app.

## Aether

- **Mobile not yet user-tested on real device simulators** — the responsive `MobileShell` (off-canvas drawer, view-switched panels, full-screen capability overlay) and the Playwright mobile matrix both exist, but no human has driven every feature on the iOS/iPadOS Simulator and Android emulator end-to-end. Needs a hands-on pass: chat send/stop, sidebar drawer, each render-tool widget, Tiles canvas drag/resize, knowledge-graph pan/zoom, model picker, settings — across iPhone + iPad + Pixel, portrait and landscape. (Shared task: Andrew + Claude.)
- **Incomplete mobile affordance scan** — sweep for any remaining hover-only controls that still need touch equivalents. (Sidebar rename/delete and the conversation-title edit affordance are now touch-visible; the send/stop control too; the "Explore further" menu is now a touch-first Radix kebab — but the full audit isn't finished, and the Tiles GridStack drag/resize handles need a touch correctness check.)
- **Tool-update buttons disabled while chat is working** — the per-tool update/action buttons grey out for the duration of an in-flight turn. They shouldn't block: queue the action and fire it once the current turn settles, rather than disabling the control.
- **KnowledgeGraph node menu still hand-rolled** — the ForceGraph SVG node menu (canvas-anchored, drag-aware) is the last menu not yet migrated onto the shared Radix `ExploreMenu` primitive. Inconsistent open/close behavior vs. the rest of the app.

## Website

- **Needs better marketing assets** — better screenshots, updated copy, GIFs, and screen captures of the mobile experience in action.
