import { expect, test } from "./fixtures/mockApi";

// The "site isn't broken" guard. Runs on every viewport (all 7 projects): the app
// loads, the shell renders, the compose box is present, and nothing threw to the
// console. This is the cheapest, broadest signal that a deploy is alive.
test("app loads with the compose box and no console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");

  // The compose textarea is the load-bearing affordance — if it's there, the
  // shell mounted and the providers wired up.
  const composer = page.getByPlaceholder(/Type a message/i);
  await expect(composer).toBeVisible();

  // No uncaught errors and no console.error during load. (React act() warnings and
  // the like would surface here too.)
  expect(errors, `console errors during load:\n${errors.join("\n")}`).toEqual(
    []
  );
});
