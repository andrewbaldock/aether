import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
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
  const { entries, setEntries, nextId, requestReplace } =
    useStreamingEntries<ImagesSpec>("render_images", parseImagesSpec);

  const loadEntries = useCallback(
    (loaded: ImagesEntry[]) => {
      const rehydrated = loaded.map((e) => ({ ...e, id: nextId.current++ }));
      setEntries(rehydrated);
    },
    [nextId, setEntries]
  );

  const clearEntries = useCallback(() => setEntries([]), [setEntries]);

  const value = useMemo<ImagesState>(
    () => ({ entries, loadEntries, clearEntries, requestReplace }),
    [entries, loadEntries, clearEntries, requestReplace]
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
