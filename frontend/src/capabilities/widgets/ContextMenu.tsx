import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreVertical } from "lucide-react";
import type { ReactNode } from "react";
import { ICON_BUTTON_CLASS } from "../../shell/IconButton";
import { OVERLAY_SURFACE } from "../../shell/overlay";

// A small kebab-triggered action menu shared by the Table / Chart / Images /
// Timeline widgets — the "Explore further" affordance on a row, series, tile, or
// event. Built on Radix DropdownMenu so it works on TOUCH (a visible ⋮ button),
// not just right-click — the old onContextMenu version was unreachable on phones.
// Radix handles outside-click, Escape, focus trapping, and viewport-collision
// flipping for us.

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  // Optional leading glyph (e.g. a lucide icon for Rename/Delete rows).
  icon?: ReactNode;
  // Destructive actions (Delete) render in the danger colour.
  destructive?: boolean;
}

// The dropdown panel + its items — the shared LOOK of every menu in the app
// (Explore further, sidebar rename/delete, the knowledge-graph node menu). Split
// out from ExploreMenu so callers that supply their OWN Radix Trigger (e.g. the
// ForceGraph's canvas-anchored phantom trigger) get the identical panel without
// duplicating the markup. Render it inside a <DropdownMenu.Root>.
export function MenuItems({
  items,
  align = "end",
  side,
}: {
  items: ContextMenuItem[];
  align?: DropdownMenu.DropdownMenuContentProps["align"];
  side?: DropdownMenu.DropdownMenuContentProps["side"];
}) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        side={side}
        sideOffset={4}
        className={`z-9999 min-w-44 py-1 ${OVERLAY_SURFACE.popover}`}
      >
        {items.map((item) => (
          <DropdownMenu.Item
            key={item.label}
            onSelect={item.onClick}
            className={`flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm outline-none data-highlighted:bg-elevated ${
              item.destructive ? "text-danger-content" : "text-content"
            }`}
          >
            {item.icon}
            {item.label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

// The kebab trigger + its dropdown. Drop it wherever the target's layout has room
// (a table cell, the corner of a tile, beside a chip). ≥44px tap target per the
// mobile-first rule; `aria-label` names what it acts on for screen readers.
// `triggerClassName` lets a caller restyle the trigger (e.g. the sidebar's
// hover-reveal kebab) without forking the menu; `align`/`side` tune placement.
export function ExploreMenu({
  items,
  label = "Actions",
  className,
  triggerClassName,
  align = "end",
  side,
}: {
  items: ContextMenuItem[];
  label?: string;
  className?: string;
  triggerClassName?: string;
  align?: DropdownMenu.DropdownMenuContentProps["align"];
  side?: DropdownMenu.DropdownMenuContentProps["side"];
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {/* Raw button, not <IconButton>: Radix's asChild clones this element
            directly and needs a real DOM ref, which the shared component (a
            plain function returning a <Tooltip> wrapper) can't forward. Same
            shared class as every other icon button, plus the open-state pink.
            The negative margin keeps the 44px hit area from bloating tight
            layouts; a caller can override the whole trigger style via
            triggerClassName. */}
        <button
          type="button"
          aria-label={label}
          className={
            triggerClassName ??
            `-m-2 ${ICON_BUTTON_CLASS} data-[state=open]:border-border data-[state=open]:bg-elevated data-[state=open]:text-neon-pink ${className ?? ""}`
          }
        >
          <MoreVertical className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <MenuItems items={items} align={align} side={side} />
    </DropdownMenu.Root>
  );
}

// Back-compat wrapper for the call sites that wrapped a target with a right-click
// menu. Now it renders the target with the kebab overlaid in the top-right corner
// — so existing `<WithContextMenu items={...}><Target/></WithContextMenu>` usage
// keeps working with a touch-friendly trigger. Consumers whose layout needs the
// kebab elsewhere can use <ExploreMenu> directly.
export function WithContextMenu({
  items,
  label,
  children,
}: {
  items: ContextMenuItem[];
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="group/menu relative">
      {children}
      {/* Always visible on touch (no hover); fades up on hover for pointer
          devices so it's discoverable without cluttering every tile at rest. */}
      <div className="absolute right-1 top-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/menu:opacity-100 sm:group-focus-within/menu:opacity-100">
        <ExploreMenu items={items} label={label} />
      </div>
    </div>
  );
}
