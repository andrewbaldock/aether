import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { copyTitle } from "../duplicateTitle";
import { useStreamingEntries } from "../useStreamingEntries";
import type { ImageItem, ImagesSpec } from "./types";

export interface ImagesEntry {
  id: number;
  spec: ImagesSpec;
}

export interface ImagesState {
  entries: ImagesEntry[];
  loadEntries: (entries: ImagesEntry[]) => void;
  clearEntries: () => void;
  // Rebuild = replace-on-arrival: keep the current images until the new set lands.
  requestReplace: () => void;
  // Reload ONE gallery by id: the next spec replaces just that entry, in place.
  requestReplaceEntry: (id: number) => void;
  // Duplicate ONE gallery by id: deep-clone its spec, suffix "(copy)" on the title,
  // and insert it directly AFTER the source so the copy lands right beneath the
  // original in both the tool tab and the Bigsail canvas.
  duplicateEntry: (id: number) => void;
  // Replace ONE gallery's spec in place by id (a direct edit — no model call,
  // unlike requestReplaceEntry). Used by the param/prompt editor and the backfill.
  updateEntry: (id: number, spec: ImagesSpec) => void;
}

const ImagesContext = createContext<ImagesState | null>(null);

export function parseImagesSpec(raw: string): ImagesSpec | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data == null || typeof data !== "object") return null;
  const { title, blurb, images } = data as Record<string, unknown>;
  if (!Array.isArray(images)) return null;

  const validImages = images
    .filter(
      (im): im is Record<string, unknown> =>
        im != null &&
        typeof im === "object" &&
        typeof (im as Record<string, unknown>).url === "string"
    )
    .map((im): ImageItem => {
      const str = (k: string) =>
        typeof im[k] === "string" ? (im[k] as string) : undefined;
      const source =
        im.source === "unsplash" || im.source === "wikimedia"
          ? im.source
          : undefined;
      return {
        url: im.url as string,
        alt: str("alt"),
        caption: str("caption"),
        href: str("href"),
        credit: str("credit"),
        source,
      };
    });
  if (validImages.length === 0) return null;

  return {
    title: typeof title === "string" ? title : undefined,
    blurb: typeof blurb === "string" ? blurb : undefined,
    images: validImages,
  };
}

export function ImagesProvider({ children }: { children: ReactNode }) {
  // Streamed partials + final tool_result, via the shared streaming-entries hook.
  const { entries, setEntries, nextId, requestReplace, requestReplaceEntry } =
    useStreamingEntries<ImagesSpec>(
      "render_images",
      parseImagesSpec,
      (spec) => spec.title
    );

  const loadEntries = useCallback(
    (loaded: ImagesEntry[]) => {
      const rehydrated = loaded.map((e) => ({ ...e, id: nextId.current++ }));
      setEntries(rehydrated);
    },
    [nextId, setEntries]
  );

  const clearEntries = useCallback(() => setEntries([]), [setEntries]);

  const duplicateEntry = useCallback(
    (id: number) => {
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === id);
        const src = prev[idx];
        if (!src) return prev;
        const clone: ImagesEntry = {
          id: nextId.current++,
          spec: {
            ...structuredClone(src.spec),
            title: copyTitle(src.spec.title),
          },
        };
        const next = prev.slice();
        next.splice(idx + 1, 0, clone);
        return next;
      });
    },
    [nextId, setEntries]
  );

  const updateEntry = useCallback(
    (id: number, spec: ImagesSpec) => {
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === id);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = { id, spec };
        return next;
      });
    },
    [setEntries]
  );

  const value = useMemo<ImagesState>(
    () => ({
      entries,
      loadEntries,
      clearEntries,
      requestReplace,
      requestReplaceEntry,
      duplicateEntry,
      updateEntry,
    }),
    [
      entries,
      loadEntries,
      clearEntries,
      requestReplace,
      requestReplaceEntry,
      duplicateEntry,
      updateEntry,
    ]
  );

  return (
    <ImagesContext.Provider value={value}>{children}</ImagesContext.Provider>
  );
}

export function useImagesState(): ImagesState {
  const ctx = useContext(ImagesContext);
  if (!ctx) {
    throw new Error("useImagesState must be used within an ImagesProvider");
  }
  return ctx;
}
