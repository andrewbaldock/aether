# Known Issues

Known rough edges, not yet fixed. Tagged `website:` for the portfolio site; untagged = Aether app.

## Aether

- **Explore further not working on mobile** — the "explore further" affordance is a right-click context menu (`WithContextMenu` → `onContextMenu`), which never fires on touch. Best fixed by the **shared menu/select primitive** in [ROADMAP.md](./ROADMAP.md) (one Radix dropdown replaces this menu, the sidebar kebab, and — via Radix select — the model picker), rather than patching the context menu alone.
- **No mobile portrait layout** — on portrait/mobile, the conversation and capability columns should stack vertically instead of sitting side by side.
- **Incomplete mobile affordance scan** — sweep for any remaining hover-only controls that still need touch equivalents. (Sidebar rename/delete and the conversation-title edit affordance are now touch-visible; the send/stop control too — but the full audit isn't finished.)
- **Help panel animation only works if already open** — opening the Welcome/help panel mid-query skips its open animation; it only animates correctly when opened before asking a question.
- **"Working" dialogs don't name the active tool** — the in-progress status should say which tool/data source is running right now, not a generic "working" message.

## Website

- **Needs better marketing assets** — better screenshots, updated copy, GIFs, and screen captures of the mobile experience in action.
