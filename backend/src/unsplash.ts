// Unsplash API compliance helpers.
//
// Unsplash's API terms require that when an app actually DISPLAYS a photo, it
// pings that photo's `download_location` endpoint once — a tracking ping that
// credits the photographer's download count (it does NOT fetch image bytes and
// has no rate-limit quota). We display images via render_images, so we fire the
// ping at render time, only for photos the model actually shows.
//
// To do that we remember each searched photo's download_location keyed by the
// image url that flows through to render_images. The cache is small, in-process,
// and best-effort: a miss (e.g. the render landed on a different machine than
// the search) just means we skip one credit ping — acceptable, not user-facing.

const KEY = process.env.UNSPLASH_ACCESS_KEY;
const TRIGGER_TIMEOUT_MS = 4000;
const MAX_ENTRIES = 500; // bound memory; oldest entries evicted

// url → download_location. Insertion-ordered Map so we can evict the oldest.
const downloadLocations = new Map<string, string>();

// Remember a photo's download_location so we can credit it when it's rendered.
export function rememberUnsplashDownload(
  imageUrl: string,
  downloadLocation: string | undefined
): void {
  if (!downloadLocation) return;
  if (downloadLocations.has(imageUrl)) downloadLocations.delete(imageUrl);
  downloadLocations.set(imageUrl, downloadLocation);
  if (downloadLocations.size > MAX_ENTRIES) {
    const oldest = downloadLocations.keys().next().value;
    if (oldest !== undefined) downloadLocations.delete(oldest);
  }
}

// Fire the download-credit ping for any of these image urls we have a
// download_location for. Fire-and-forget: errors are swallowed (a missed credit
// ping must never break rendering). Requires the access key (Client-ID auth).
export function triggerUnsplashDownloads(imageUrls: string[]): void {
  if (!KEY) return;
  for (const url of imageUrls) {
    const loc = downloadLocations.get(url);
    if (!loc) continue;
    downloadLocations.delete(url); // credit once per render
    void fetch(loc, {
      headers: { Authorization: `Client-ID ${KEY}`, "Accept-Version": "v1" },
      signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
    }).catch(() => {
      // Best-effort: a failed credit ping is not worth surfacing.
    });
  }
}
