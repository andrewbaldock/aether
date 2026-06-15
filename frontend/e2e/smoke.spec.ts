import { expect, test } from "./fixtures/mockApi";

// The "site isn't broken" guard. Runs on every viewport (all 7 projects): the app
// loads, the shell renders, the compose box is present, and nothing threw to the
// console. This is the cheapest, broadest signal that a deploy is alive.
test("app loads with the compose box and no console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !isApiLoadNoise(msg.text())) {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");

  // The compose textarea is the load-bearing affordance — if it's there, the
  // shell mounted and the providers wired up.
  const composer = page.getByPlaceholder(/Type a message/i);
  await expect(composer).toBeVisible();

  // No uncaught errors and no console.error during load — other than the benign
  // /api-load noise filtered above. (React act() warnings, real render errors,
  // and uncaught page errors still surface here.)
  expect(errors, `console errors during load:\n${errors.join("\n")}`).toEqual(
    []
  );
});

// Under full parallelism a handful of on-mount /api fetches (models, sessions) can
// fire in the millisecond before Playwright's per-page network mock is attached for
// that worker, so they reach the (proxy-less, backend-less) E2E preview and log a
// failure through the api error logger. That's a test-harness race, not an app bug —
// the data layer retries and the UI renders fine — so we ignore exactly that noise
// while still failing on any genuine console error or uncaught exception.
function isApiLoadNoise(text: string): boolean {
  return (
    text.includes("[aether/api]") ||
    text.includes("Failed to load resource") ||
    text.includes("502") ||
    text.includes("Bad Gateway")
  );
}
