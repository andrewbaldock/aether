// Shared resolution for model-chosen lucide icon names. Both the Knowledge Graph
// (per-node icon) and the Timeline (per-entry icon) let the model pick an icon
// from the backend's ICON_VOCABULARY; this turns that PascalCase suggestion into
// a real, lazy-loadable lucide name — or null when the model invented one.
import { type IconName, iconNames } from "lucide-react/dynamic";

export { DynamicIcon, type IconName } from "lucide-react/dynamic";

// "FlaskConical" → "flask-conical", "Building2" → "building-2"; lucide's dynamic
// loader keys off kebab-case. A letter→digit boundary also gets a dash, matching
// lucide's naming (Building2 is "building-2", not "building2").
export function toKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .toLowerCase();
}

// The set of real lucide icon names, for O(1) validation. The model frequently
// guesses plausible-but-nonexistent names (e.g. "vinyl-record"); handing one to
// DynamicIcon makes it attempt a dynamic import that rejects and logs a console
// error before the fallback renders. Checking membership first means we only
// ever lazy-load names that exist, and silently use the fallback otherwise.
const VALID_ICON_NAMES = new Set<string>(iconNames);

// Returns the kebab name if it's a real lucide icon, else null.
export function resolveIconName(icon: string): IconName | null {
  const kebab = toKebab(icon);
  return VALID_ICON_NAMES.has(kebab) ? (kebab as IconName) : null;
}
