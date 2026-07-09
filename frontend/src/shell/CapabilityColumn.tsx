import { CAPABILITIES, type Capability } from "../capabilities/catalog";
import { getRenderer, type Widget } from "../capabilities/registry";
import { useCapabilities } from "../capabilities/useCapabilities";
import { useCapabilityContent } from "../capabilities/useCapabilityContent";
import { HEALTH_WIDGET } from "../capabilities/widgets/Health";
import { METRICS_WIDGET } from "../capabilities/widgets/Metrics";
import { SETTINGS_WIDGET } from "../capabilities/widgets/Settings";
import { STYLEGUIDE_WIDGET } from "../capabilities/widgets/StyleGuide";
import { TOKENLAB_WIDGET } from "../capabilities/widgets/TokenLab";
import { WELCOME_WIDGET } from "../capabilities/widgets/Welcome";
import { replaceRoute, viewPath } from "../hooks/useRoute";
import { useSessionContext } from "./SessionContext";
import { Tooltip } from "./Tooltip";
import { useAdminNav } from "./useAdminNav";
import { useIsMobile } from "./useIsMobile";

// Non-capability views reachable from the toolbar's right cluster or via deep
// links (no content/glow state). Kept here so the active-title lookup recognises
// them when one is the active view.
const UTILITY_TITLES: Record<string, string> = {
  [WELCOME_WIDGET.id]: WELCOME_WIDGET.title,
  [SETTINGS_WIDGET.id]: SETTINGS_WIDGET.title,
  [HEALTH_WIDGET.id]: HEALTH_WIDGET.title,
  [METRICS_WIDGET.id]: METRICS_WIDGET.title,
  [STYLEGUIDE_WIDGET.id]: STYLEGUIDE_WIDGET.title,
  [TOKENLAB_WIDGET.id]: TOKENLAB_WIDGET.title,
  // Dev-only Screenshots admin page. Literal id (not an import) so the gallery
  // module stays out of the prod bundle; the renderer is only registered in dev,
  // and the tab that activates it is dev-gated too.
  screenshots: "Screenshots",
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
  const { activeId, unseen, isFullscreen, setFullscreen } = useCapabilities();
  const hasContent = useCapabilityContent();
  const isMobile = useIsMobile();
  const { sessionId } = useSessionContext();
  // The two utility chips (settings + help) are URL-driven admin pages: clicking
  // one opens its path, clicking the active one turns it off (navigates back).
  const settingsNav = useAdminNav("settings");
  const welcomeNav = useAdminNav("welcome");

  // Selecting a tool tab is purely a navigation — the URL is the source of truth
  // and activeId projects from it (the route reader in ChatPanel/Shell activates
  // the matching widget). viewPath builds the right shape for every state: /:view
  // on the home screen (no session), /c/:id/:view in a conversation, and either way
  // it REPLACES the current entry so tab-hopping doesn't pile up history. This also
  // cleanly leaves an admin page (the path stops matching /settings), so no special
  // "leave admin" handling is needed.
  const selectCapability = (id: string) => {
    replaceRoute(viewPath(sessionId, id));
  };

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
      {/* Capability toolbar. A container so the chips react to the column's own
          width (it resizes independently of the viewport): as it narrows the
          left chips drop their text (icon-only), and slimmer still they wrap to
          a second row while the right cluster stays pinned top-right. Chips are
          tap-sized on mobile. `items-start` keeps the right cluster top-aligned
          when the left group grows to two rows. */}
      <div className="@container flex min-h-11 items-start gap-1 border-b border-border px-2 py-1.5">
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {CAPABILITIES.map((cap) => (
            <CapabilityChip
              key={cap.id}
              cap={cap}
              active={activeId === cap.id}
              filled={hasContent[cap.id] ?? false}
              glow={unseen.includes(cap.id)}
              isMobile={isMobile}
              onClick={() => selectCapability(cap.id)}
            />
          ))}
        </div>

        {/* Right cluster: help + settings (gear pinned to the far right). Both
            are utility views (never glow) and chrome-free unless active — they
            show a border/fill only when they're the current page. */}
        <CapabilityChip
          cap={{
            id: WELCOME_WIDGET.id,
            title: WELCOME_WIDGET.title,
            icon: <HelpIcon />,
            blurb: "What is Aether? Open the intro.",
          }}
          active={welcomeNav.isActive}
          filled={false}
          glow={false}
          iconOnly
          bare
          isMobile={isMobile}
          onClick={welcomeNav.activate}
        />
        <CapabilityChip
          cap={{
            id: SETTINGS_WIDGET.id,
            title: SETTINGS_WIDGET.title,
            icon: <GearIcon />,
            blurb: "Settings — theme and more.",
          }}
          active={settingsNav.isActive}
          filled={false}
          glow={false}
          iconOnly
          bare
          isMobile={isMobile}
          onClick={settingsNav.activate}
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
              // Match the settings-gear chip's footprint (same padding + 1px box) so
              // the right cluster aligns and is equally wide. A stroked SVG icon —
              // the old ⛶/⤢ Unicode glyphs rendered thin and undersized. Same
              // hover/active/focus colors as every other icon button.
              className="flex shrink-0 items-center rounded-lg border border-transparent px-2.5 py-1.5 text-content-muted transition-colors hover:border-border hover:bg-elevated hover:text-neon-pink active:border-border active:bg-elevated active:text-neon-pink focus-visible:border-border focus-visible:bg-elevated focus-visible:text-neon-pink focus-visible:outline-none"
            >
              {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
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
//   • bare                            → no resting chrome at all (transparent
//     border, no fill, just the icon); border/bg appears only when active. Used
//     by the right-cluster utility chips (help, settings) so they read as plain
//     icon buttons until they're the current page.
function CapabilityChip({
  cap,
  active,
  filled,
  glow,
  iconOnly,
  bare,
  isMobile,
  onClick,
}: {
  cap: Capability;
  active: boolean;
  filled: boolean;
  glow: boolean;
  iconOnly?: boolean;
  bare?: boolean;
  isMobile: boolean;
  onClick: () => void;
}) {
  // Tone encodes two axes: content (filled vs hollow) and active (the showing
  // view). Active never uses a ring — it gets a stronger border, plus a slightly
  // darker fill ONLY when the chip has content; an empty active chip stays hollow
  // (stronger border alone), so "active" never implies "has content".
  //
  // Every chip keeps the same 1px border (so layout never shifts). The active
  // chip thickens to a visible 2px edge via an INSET box-shadow painted just
  // inside that 1px border — box-shadow takes no space, so the chip's size and
  // its alignment with neighbours are unaffected. (Tailwind's border-2 + negative
  // margin looked off against the flex gap / scroll container, hence the shadow.)
  const base =
    "relative flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors max-md:h-11 max-md:min-w-11 max-md:justify-center max-md:px-3";
  let tone: string;
  if (bare) {
    // Bare chips (right-cluster utilities: help, settings) carry no resting
    // chrome: transparent border (keeps the 1px box so state changes never
    // shift layout) and a muted icon. Active looks exactly like hover — a thin
    // border + fill — rather than the heavier stronger-border + ring the
    // content chips use. Hover/active/focus colors are hand-matched to
    // IconButton's ICON_BUTTON_CLASS (same border/bg/pink treatment as every
    // other icon button) — this component can't just render <IconButton>
    // itself, since it also carries the active-page state, aria-pressed, and
    // glow-dot logic the content chips need.
    tone = active
      ? "border-border bg-elevated text-content hover:text-neon-pink"
      : "border-transparent text-content-muted hover:border-border hover:bg-elevated hover:text-neon-pink active:border-border active:bg-elevated active:text-neon-pink focus-visible:border-border focus-visible:bg-elevated focus-visible:text-neon-pink focus-visible:outline-none";
  } else if (filled && active) {
    // Active content tab: soft grey-green fill (lighter sage in dark) so the
    // showing view reads as "selected" with the brand's grey-green, not a flat grey.
    tone = "border-content-subtle bg-[#d5ebd5] dark:bg-[#2a3a2a] text-content";
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

  // Inset shadow ring that thickens the active chip's 1px border to a crisp 2px
  // without changing its box size. Uses the same theme token as the border color.
  // Bare chips opt out — their active state is the lighter hover look, no ring.
  const activeRing =
    active && !bare
      ? { boxShadow: "inset 0 0 0 1px var(--content-subtle)" }
      : undefined;

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
      style={activeRing}
    >
      {cap.icon}
      {!iconOnly && (
        // Icon-only on mobile, and icon-only once the toolbar container itself
        // gets narrow enough that the left chips would collide with the right
        // cluster (@max-[640px]). The label shows otherwise.
        <span className="max-md:hidden @max-[640px]:hidden">{cap.title}</span>
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
      className="h-4.5 w-4.5"
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
      className="h-4.5 w-4.5"
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

// Enter-fullscreen: four corner brackets pointing outward. Same 1.125rem (18px
// at the default text size) / 1.75 stroke as GearIcon so the right-cluster
// utilities read as one consistent set.
function FullscreenIcon() {
  return (
    <svg
      className="h-4.5 w-4.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

// Exit-fullscreen: four corner brackets pointing inward.
function ExitFullscreenIcon() {
  return (
    <svg
      className="h-4.5 w-4.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}
