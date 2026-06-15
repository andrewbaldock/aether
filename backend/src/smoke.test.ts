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

describe("smoke: core routes are registered", () => {
  // Each route below is a load-bearing entry point the frontend or the platform
  // depends on. We assert the route EXISTS (responds, not 404), not that it
  // succeeds end-to-end — a 400 (bad input) still proves the handler is wired; a
  // 404 means the route is gone. This is the cheap "did the app assemble?" check.
  const routes: { method: string; path: string; init?: RequestInit }[] = [
    { method: "GET", path: "/api/health/full" },
    { method: "GET", path: "/api/models" },
    // by-userId list (no userId → 400, but the route is registered)
    { method: "GET", path: "/api/sessions" },
    // create (no body → 400, but registered)
    { method: "POST", path: "/api/sessions" },
    // by-id read (random id → 404 OR 500 from DB, but NOT a routing 404 with
    // Hono's default body — so we only assert it's not the unrouted case below)
    { method: "GET", path: "/api/sessions/00000000-0000-0000-0000-000000000000/messages" },
  ];

  for (const { method, path, init } of routes) {
    it(`${method} ${path} is routed (not 404-unrouted)`, async () => {
      const res = await request(path, { method, ...init });
      // Hono returns 404 for an UNREGISTERED path. A registered handler that
      // rejects bad input returns 400 (or 401/500), never the unrouted 404.
      // Some of these legitimately 404 on a missing row at the DB layer, but
      // those paths reach the DB which isn't configured in the test env and
      // throw → 500. Either way, a *routing* miss is the only thing that yields
      // 404 here, so we assert the status is not 404.
      expect(res.status).not.toBe(404);
    });
  }
});
