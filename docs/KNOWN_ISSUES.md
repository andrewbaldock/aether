# Known Issues

Known rough edges, not yet fixed. Tagged `website:` for the portfolio site; untagged = Aether app.

## Aether

- **No mobile portrait layout** — on portrait/mobile, the conversation and capability columns should stack vertically instead of sitting side by side.
- **Incomplete mobile affordance scan** — sweep for any remaining hover-only controls that still need touch equivalents. (Sidebar rename/delete and the conversation-title edit affordance are now touch-visible; the send/stop control too; the "Explore further" menu is now a touch-first Radix kebab — but the full audit isn't finished.)
- **Tool-update buttons disabled while chat is working** — the per-tool update/action buttons grey out for the duration of an in-flight turn. They shouldn't block: queue the action and fire it once the current turn settles, rather than disabling the control.

## Website

- **Needs better marketing assets** — better screenshots, updated copy, GIFs, and screen captures of the mobile experience in action.
