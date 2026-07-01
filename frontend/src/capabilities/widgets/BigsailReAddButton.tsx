import { Eye } from "lucide-react";
import { Tooltip } from "../../shell/Tooltip";
import { useHiddenCards } from "./Bigsail/useHiddenCards";

// The "add this back to the Bigsail canvas" control for a tool tab's entry header.
// A widget that's been hidden from the canvas (via the EyeOff on its card back) can
// be restored from here — the Eye↔EyeOff show/hide pair. Renders NOTHING when the
// entry isn't hidden, so callers can drop it unconditionally into every entry header
// and it only appears for hidden ones.
//
// `cardId` is the stable Bigsail card id, `${capability}:${entryId}` — the same key
// useHiddenCards stores. Each tool tab builds it from its capability + entry id.
export function BigsailReAddButton({ cardId }: { cardId: string }) {
  const { isHidden, unhide } = useHiddenCards();
  if (!isHidden(cardId)) return null;
  const label = "Add this back to the Bigsail canvas";
  return (
    <Tooltip
      label={label}
      contentClassName="w-64 whitespace-normal leading-snug"
    >
      <button
        type="button"
        onClick={() => unhide(cardId)}
        aria-label={label}
        className="shrink-0 rounded-md p-1 text-content-subtle/60 transition-colors hover:bg-elevated hover:text-content focus-visible:bg-elevated focus-visible:text-content focus-visible:outline-none"
      >
        <Eye className="h-4 w-4" aria-hidden />
      </button>
    </Tooltip>
  );
}
