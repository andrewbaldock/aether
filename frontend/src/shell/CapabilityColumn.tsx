import { CAPABILITIES, type Capability } from "../capabilities/catalog";
import { getRenderer, type Widget } from "../capabilities/registry";
import { useCapabilities } from "../capabilities/useCapabilities";
import { useCapabilityContent } from "../capabilities/useCapabilityContent";
import { HEALTH_WIDGET } from "../capabilities/widgets/Health";
import { SETTINGS_WIDGET } from "../capabilities/widgets/Settings";
import { WELCOME_WIDGET } from "../capabilities/widgets/Welcome";
import { Tooltip } from "./Tooltip";
import { useIsMobile } from "./useIsMobile";

// Non-capability views reachable from the toolbar's right cluster or via deep
// links (no content/glow state). Kept here so the active-title lookup recognises
// them when one is the active view.
const UTILITY_TITLES: Record<string, string> = {
  [WELCOME_WIDGET.id]: WELCOME_WIDGET.title,
  [SETTINGS_WIDGET.id]: SETTINGS_WIDGET.title,
  [HEALTH_WIDGET.id]: HEALTH_WIDGET.title,
};

// Right zone: the capability host. A fixed toolbar of capability chips drives a
// single active view. Every capability is always present (no open/close): a chip
// is unfilled when its widget has no content and filled once it does, gets a
// border highlight when it's the active view, and shows a pink glow when it has
// new content the user hasn't looked at yet.
//
// The Knowledge Graph is home base (first chip, the default active view). The
// Welcome/help page is pinned to the right; the (?) icon elsewhere activates it.
export function CapabilityColumn() {
  const { activeId, unseen, isFullscreen, activate, setFullscreen } =
    useCapabilities();
  const hasContent = useCapabilityContent();
  const isMobile = useIsMobile();

  // Build a throwaway widget descriptor for the active view. Every widget's
  // renderer is keyed by a type equal to its id, so the id doubles as the type.
  const activeTitle =
    UTILITY_TITLES[activeId] ??
    CAPABILITIES.find((c) => c.id === activeId)?.title ??
    "";
  const activeWidget: Widget = {
    id: activeId,
    type: activeId,
    title: activeTitle,
    state: null,
  };
  const Renderer = getRenderer(activeWidget.type);

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-surface">
      {/* Capability toolbar. Horizontally scrollable so it never clips chips on a
          narrow column; chips are tap-sized on mobile. */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {CAPABILITIES.map((cap) => (
            <CapabilityChip
              key={cap.id}
              cap={cap}
              active={activeId === cap.id}
              filled={hasContent[cap.id] ?? false}
              glow={unseen.includes(cap.id)}
              isMobile={isMobile}
              onClick={() => activate(cap.id)}
            />
          ))}
        </div>

        {/* Right cluster: settings + help. Both are utility views (always
            "filled", never glow), pinned to the right edge of the toolbar. */}
        <CapabilityChip
          cap={{
            id: SETTINGS_WIDGET.id,
            title: SETTINGS_WIDGET.title,
            icon: <GearIcon />,
            blurb: "Settings — theme and more.",
          }}
          active={activeId === SETTINGS_WIDGET.id}
          filled
          glow={false}
          iconOnly
          isMobile={isMobile}
          onClick={() => activate(SETTINGS_WIDGET.id)}
        />
        <CapabilityChip
          cap={{
            id: WELCOME_WIDGET.id,
            title: WELCOME_WIDGET.title,
            icon: <HelpIcon />,
            blurb: "What is Aether? Open the intro.",
          }}
          active={activeId === WELCOME_WIDGET.id}
          filled
          glow={false}
          iconOnly
          isMobile={isMobile}
          onClick={() => activate(WELCOME_WIDGET.id)}
        />

        {/* Expand-to-full-page is meaningless on mobile (the capability view is
            already a full-screen overlay there). Hide it < md. */}
        {!isMobile && (
          <Tooltip
            label={isFullscreen ? "Exit full page" : "Expand to full page"}
            side="bottom"
          >
            <button
              type="button"
              onClick={(e) => {
                setFullscreen(!isFullscreen);
                e.currentTarget.blur();
              }}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              className="shrink-0 rounded-md px-2 py-1.5 text-sm text-content-muted hover:bg-elevated hover:text-content"
            >
              {isFullscreen ? "⤢" : "⛶"}
            </button>
          </Tooltip>
        )}
      </div>

      {/* Active view — vertical scroll only; widgets manage their own width. */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden text-content">
        {Renderer ? (
          <Renderer widget={activeWidget} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-content-subtle">
            No renderer registered for “{activeWidget.type}”.
          </div>
        )}
      </div>
    </div>
  );
}

// One chip in the capability toolbar.
//   • hollow (muted, no fill)         → no content yet
//   • filled (raised fill)            → has content
//   • active (stronger border, darker → the showing view; darker fill only when
//     fill when it has content)         it also has content, else hollow
//   • glow (pink dot)                 → new, unviewed content
function CapabilityChip({
  cap,
  active,
  filled,
  glow,
  iconOnly,
  isMobile,
  onClick,
}: {
  cap: Capability;
  active: boolean;
  filled: boolean;
  glow: boolean;
  iconOnly?: boolean;
  isMobile: boolean;
  onClick: () => void;
}) {
  // Tone encodes two axes: content (filled vs hollow) and active (the showing
  // view). Active never uses a ring — it gets a stronger border, plus a slightly
  // darker fill ONLY when the chip has content; an empty active chip stays hollow
  // (stronger border alone), so "active" never implies "has content".
  const base =
    "relative flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors max-md:h-11 max-md:min-w-11 max-md:justify-center max-md:px-3";
  let tone: string;
  if (filled && active) {
    tone = "border-content-subtle bg-border-strong text-content";
  } else if (filled) {
    tone =
      "border-border-strong bg-elevated text-content hover:bg-border-strong";
  } else if (active) {
    // Empty + active: hollow, but a stronger border marks it as the showing view.
    tone = "border-content-subtle text-content hover:bg-elevated";
  } else {
    tone =
      "border-border text-content-muted hover:bg-elevated hover:text-content";
  }

  const button = (
    <button
      type="button"
      onClick={(e) => {
        onClick();
        e.currentTarget.blur();
      }}
      aria-label={cap.title}
      aria-pressed={active}
      className={`${base} ${tone}`}
    >
      {cap.icon}
      {!iconOnly && (
        // Icon-only on mobile keeps the toolbar compact; the label shows ≥ md.
        <span className="max-md:hidden">{cap.title}</span>
      )}
      {/* New-content glow. Positioned top-right so it reads even when the chip
          is icon-only on mobile. */}
      {glow && (
        <span
          role="img"
          aria-label="New content"
          className="aether-unseen-dot absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#fd40a4]"
        />
      )}
    </button>
  );

  // On touch devices, skip the Radix hover-Tooltip wrapper entirely: a hover
  // bubble is useless on touch, and Radix's tooltip trigger can swallow the first
  // tap (the "chips do nothing on mobile" bug). The bare button taps reliably.
  if (isMobile) return button;

  return (
    <Tooltip
      label={cap.blurb}
      side="bottom"
      contentClassName="max-w-xs whitespace-normal break-words px-2.5 py-1.5 leading-snug"
    >
      {button}
    </Tooltip>
  );
}

function HelpIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
