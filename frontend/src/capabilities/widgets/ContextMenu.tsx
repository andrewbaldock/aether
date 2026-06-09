import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

// A minimal right-click context menu shared by the Table and Chart widgets.
// Usage: wrap the target element with <WithContextMenu items={[...]}>.
// Each item has a label and an onClick. The menu closes on any outside click,
// Escape, or scroll.

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
}

interface MenuState {
  x: number;
  y: number;
}

export function WithContextMenu({
  items,
  children,
}: {
  items: ContextMenuItem[];
  children: ReactNode;
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    if (!menu) return;
    function close() {
      setMenu(null);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  // display:contents makes this wrapper invisible in the layout — it's a pure
  // event-capture shim, not an interactive element. The actual interactive items
  // are the <button role="menuitem"> elements inside ContextMenuPopup.
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: intentional transparent capture wrapper
    <div
      role="presentation"
      onContextMenu={handleContextMenu}
      style={{ display: "contents" }}
    >
      {children}
      {menu && (
        <ContextMenuPopup
          ref={menuRef}
          x={menu.x}
          y={menu.y}
          items={items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function ContextMenuPopup({
  x,
  y,
  items,
  onClose,
  ref,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  ref: React.Ref<HTMLDivElement>;
}) {
  const MENU_W = 180;
  const MENU_H = items.length * 36 + 8;
  const left = Math.min(x, window.innerWidth - MENU_W - 8);
  const top = Math.min(y, window.innerHeight - MENU_H - 8);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ position: "fixed", left, top, zIndex: 9999, width: MENU_W }}
      className="rounded-lg border border-border-strong bg-surface-raised py-1 shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className="flex w-full items-center px-3 py-2 text-left text-sm text-content hover:bg-elevated"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
