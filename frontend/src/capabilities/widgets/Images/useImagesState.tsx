import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AgentEvent,
  useAgentEvents,
} from "../../../shell/AgentEventContext";
import type { ImageItem, ImagesSpec } from "./types";

export interface ImagesEntry {
  id: number;
  spec: ImagesSpec;
}

export interface ImagesState {
  entries: ImagesEntry[];
  loadEntries: (entries: ImagesEntry[]) => void;
  clearEntries: () => void;
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
  const bus = useAgentEvents();
  const [entries, setEntries] = useState<ImagesEntry[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    function handle(event: AgentEvent) {
      if (event.type !== "tool_result") return;
      if (event.tool !== "render_images") return;
      const parsed = parseImagesSpec(event.result);
      if (parsed)
        setEntries((prev) => [...prev, { id: nextId.current++, spec: parsed }]);
    }
    return bus.subscribe(handle);
  }, [bus]);

  const loadEntries = useCallback((loaded: ImagesEntry[]) => {
    const rehydrated = loaded.map((e) => ({ ...e, id: nextId.current++ }));
    setEntries(rehydrated);
  }, []);

  const clearEntries = useCallback(() => setEntries([]), []);

  const value = useMemo<ImagesState>(
    () => ({ entries, loadEntries, clearEntries }),
    [entries, loadEntries, clearEntries]
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
