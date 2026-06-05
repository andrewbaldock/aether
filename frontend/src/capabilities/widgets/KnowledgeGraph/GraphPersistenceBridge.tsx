import { useEffect, useRef } from "react";
import { useSessionContext } from "../../../shell/SessionContext";
import {
  type GraphSnapshot,
  useKnowledgeGraphState,
} from "./useKnowledgeGraphState";

const SAVE_DEBOUNCE_MS = 900;

// Bridges the (root-level) KnowledgeGraph state to per-session persistence.
// Lives *inside* SessionProvider so it can read sessionId — the graph provider
// itself sits above SessionProvider (at the app root) so it never misses a bus
// payload, which is why this glue is a separate component rather than logic in
// the provider.
//
// - On session change: load that session's saved snapshot (or clear for a
//   brand-new, not-yet-persisted conversation).
// - On graph change (revision bump) for the active session: debounce-save.
export function GraphPersistenceBridge() {
  const { sessionId } = useSessionContext();
  const { revision, getSnapshot, loadGraph, clearGraph } =
    useKnowledgeGraphState();

  // The session the graph state currently belongs to. Guards saves so an
  // in-flight debounce can't write the previous session's graph under the new
  // id after a switch.
  const loadedSessionRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load (or clear) when the active session changes.
  useEffect(() => {
    // Cancel any pending save from the previous session before we swap.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    if (!sessionId) {
      // Brand-new, unsent conversation — nothing persisted yet.
      loadedSessionRef.current = null;
      clearGraph();
      return;
    }

    let cancelled = false;
    loadedSessionRef.current = null; // block saves until the load resolves
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/graph`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const snapshot = (await res.json()) as GraphSnapshot;
        if (cancelled) return;
        loadGraph({
          nodes: snapshot.nodes ?? [],
          links: snapshot.links ?? [],
        });
      } catch (err) {
        console.error("Failed to load session graph:", err);
        if (!cancelled) clearGraph();
      } finally {
        if (!cancelled) loadedSessionRef.current = sessionId;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, loadGraph, clearGraph]);

  // Debounce-save when the graph changes — but only once the active session's
  // graph has been loaded (loadedSessionRef matches), so we never save before
  // restore or under a stale id.
  useEffect(() => {
    if (!sessionId || loadedSessionRef.current !== sessionId) return;
    if (revision === 0) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const snapshot = getSnapshot();
      fetch(`/api/sessions/${sessionId}/graph`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      }).catch((err) => console.error("Failed to save session graph:", err));
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [revision, sessionId, getSnapshot]);

  return null;
}
