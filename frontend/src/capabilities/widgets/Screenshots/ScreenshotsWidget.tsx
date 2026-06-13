import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminTabs } from "../../../shell/AdminTabs";
import type { Widget } from "../../registry";

// "Screenshots" — a DEV-ONLY device-matrix contact sheet, surfaced as an admin tab
// so it's one click away while developing. It reads the manifest the capture
// script writes (e2e/screenshots.ts → public/screenshots-out/manifest.json) and
// renders the gallery. "Run now" POSTs to a dev-only backend endpoint that re-runs
// the capture, then we re-fetch the manifest. None of this exists in prod: the
// renderer is imported behind import.meta.env.DEV, the tab is dev-gated, and the
// backend endpoint is registered only in dev.

const MANIFEST_URL = "/screenshots-out/manifest.json";

interface ManifestShot {
  name: string;
  engine: string;
  orientation: "portrait" | "landscape";
  width: number;
  height: number;
  scenario: string;
  file: string;
}

interface Manifest {
  generatedAt: string;
  baseUrl?: string;
  shots: ManifestShot[];
}

export function ScreenshotsWidget(_props: { widget: Widget }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "missing">(
    "loading"
  );
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const loadManifest = useCallback(async () => {
    try {
      // Bust the cache so a fresh run's manifest is picked up immediately.
      const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`);
      if (!res.ok) {
        setLoadState("missing");
        return;
      }
      const data = (await res.json()) as Manifest;
      setManifest(data);
      setLoadState("loaded");
    } catch {
      setLoadState("missing");
    }
  }, []);

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  const runNow = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch("/api/screenshots/run", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Capture failed (${res.status})`);
      }
      await loadManifest();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Capture failed");
    } finally {
      setRunning(false);
    }
  }, [loadManifest]);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-surface">
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="mb-6">
          <AdminTabs />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-content">
              Screenshots
            </h1>
            <p className="mt-1 text-sm text-content-muted">
              Device-matrix contact sheet — every viewport the E2E suite covers,
              populated by the same mocked data.{" "}
              {manifest && (
                <span className="text-content-subtle">
                  Last run {relativeTime(manifest.generatedAt)}.
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runNow()}
            disabled={running}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-content-muted transition-colors hover:border-content-muted hover:text-content disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`}
              aria-hidden
            />
            {running ? "Capturing…" : "Run now"}
          </button>
        </div>

        {runError && (
          <p className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {runError}
          </p>
        )}

        {loadState === "loading" && (
          <p className="mt-8 text-sm text-content-muted">Loading manifest…</p>
        )}

        {loadState === "missing" && (
          <p className="mt-8 text-sm text-content-muted">
            No screenshots yet. Hit{" "}
            <span className="text-content">Run now</span> (or run{" "}
            <code className="rounded bg-elevated px-1">
              bun run screenshots
            </code>{" "}
            in <code className="rounded bg-elevated px-1">frontend/</code>) to
            capture the device matrix.
          </p>
        )}

        {loadState === "loaded" && manifest && (
          <div className="mt-6 space-y-8">
            {groupByScenario(manifest.shots).map(([scenario, shots]) => (
              <section key={scenario}>
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-content-subtle">
                  {scenario}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {shots.map((shot) => (
                    <figure
                      key={shot.name}
                      className="overflow-hidden rounded-lg border border-border bg-surface-raised"
                    >
                      <a
                        href={`/screenshots-out/${shot.file}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={`/screenshots-out/${shot.file}`}
                          alt={`${shot.name} ${shot.orientation}`}
                          className="block w-full bg-white"
                          loading="lazy"
                        />
                      </a>
                      <figcaption className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="font-medium text-content">
                          {shot.name}
                        </span>
                        <span className="text-content-subtle">
                          {shot.width}×{shot.height} · {shot.engine}
                        </span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Group shots by scenario, preserving first-seen order.
function groupByScenario(shots: ManifestShot[]): [string, ManifestShot[]][] {
  const groups = new Map<string, ManifestShot[]>();
  for (const shot of shots) {
    const list = groups.get(shot.scenario) ?? [];
    list.push(shot);
    groups.set(shot.scenario, list);
  }
  return [...groups.entries()];
}

// "3m ago" / "just now" — a compact relative time for the last-run line.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleString();
}
