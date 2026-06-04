import { useEffect, useState } from "react";

export interface WikiSummary {
  title: string;
  extract: string;
  thumbnail?: string;
  pageUrl?: string;
}

// Process-wide cache so re-selecting a node (or re-mounting the widget) never
// re-fetches. Keyed by the exact title we queried.
const cache = new Map<string, WikiSummary | null>();

interface UseWikipediaResult {
  summary: WikiSummary | null;
  loading: boolean;
  error: string | null;
}

// Fetches a Wikipedia REST summary for a node, client-side. `title` is the
// entity's wikipediaTitle when present, else its label. Aborts on unmount /
// title change so a stale fetch can't overwrite a newer selection.
export function useWikipedia(title: string | null): UseWikipediaResult {
  const [summary, setSummary] = useState<WikiSummary | null>(
    title ? (cache.get(title) ?? null) : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!title) {
      setSummary(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (cache.has(title)) {
      setSummary(cache.get(title) ?? null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { signal: controller.signal }
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{
          title?: string;
          extract?: string;
          thumbnail?: { source?: string };
          content_urls?: { desktop?: { page?: string } };
        }>;
      })
      .then((data) => {
        const result: WikiSummary = {
          title: data.title ?? title,
          extract: data.extract ?? "",
          thumbnail: data.thumbnail?.source,
          pageUrl: data.content_urls?.desktop?.page,
        };
        cache.set(title, result);
        setSummary(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Cache the miss so we don't hammer the API for a title with no article.
        cache.set(title, null);
        setSummary(null);
        setError("No Wikipedia summary found.");
        setLoading(false);
      });

    return () => controller.abort();
  }, [title]);

  return { summary, loading, error };
}
