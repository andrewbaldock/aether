import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import server from "./index";

// Boot-and-probe smoke tests. The unit tests cover pure functions in isolation,
// so they CANNOT catch a wiring bug — a route that was deleted, renamed, or never
// registered. That exact bug (the `/api/health` route dropped during an edit) shipped
// green through typecheck + every unit test and only surfaced when Fly's health
// check 404'd on deploy, taking prod down. These tests assemble the real app and
// make real requests against `server.fetch`, so a missing/broken route fails HERE.
//
// We hit `server.fetch` directly (Hono's request handler) rather than binding a
// port — same routing table, no network, runs in ~1ms.

function request(path: string, init?: RequestInit): Promise<Response> {
  // server.fetch may return Response or Promise<Response> depending on the
  // matched handler; normalise to a promise so callers can always await.
  return Promise.resolve(
    server.fetch(new Request(`http://localhost${path}`, init))
  );
}

describe("smoke: liveness", () => {
  // The single most important assertion in the suite: Fly's http_service health
  // check probes this exact path, and a non-200 here means a deploy will fail its
  // health check and roll back (or take prod down). We read the path straight from
  // fly.toml so the test tracks the real probe — if someone changes the check path
  // there, this follows instead of silently asserting a stale route.
  it("serves the fly.toml health-check path with 200", async () => {
    const flyToml = readFileSync(
      new URL("../fly.toml", import.meta.url),
      "utf8"
    );
    const match = flyToml.match(/^\s*path\s*=\s*"([^"]+)"/m);
    expect(match, "no health-check `path` found in fly.toml").not.toBeNull();
    const healthPath = match?.[1] ?? "/api/health";

    const res = await request(healthPath);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// NOTE: this file stays HERMETIC — it only probes `/api/health`, whose handler is
// a pure `c.json({ ok: true })` with no I/O. We deliberately do NOT probe
// `/api/health/full`, `/api/models`, or the session routes here: those make live
// calls (health/provider probes, Supabase) and would hang in CI where there are
// no secrets/network. Route-registration for the session endpoints is covered by
// ownership.test.ts, which mocks the db layer.
