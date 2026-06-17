import { expect, test } from "./fixtures/mockApi";

// Named regression paths from the ROADMAP: rename and delete a session from the
// sidebar, on a mobile viewport (where the drawer + kebab interactions historically
// broke). The mock intercepts PATCH (rename) and DELETE so no backend is needed; we
// assert the request fires with the right method and the UI reacts.

// The off-canvas sidebar drawer (reached via "Open sidebar") only exists below the
// 768px breakpoint. Gate on viewport width so iPad/landscape phones — which use the
// always-visible desktop sidebar — are skipped rather than failing on a missing
// drawer button. Rename/delete on desktop are covered implicitly by the same
// ExploreMenu primitive; the regression we guard here is the mobile drawer path.
test.beforeEach(async ({ page }) => {
  const vp = page.viewportSize();
  test.skip(
    !vp || vp.width >= 768,
    "mobile drawer only renders below the 768px breakpoint"
  );
});

test("rename a session from the sidebar drawer", async ({ page, mockApi }) => {
  mockApi.setSessions([
    {
      id: "sess-1",
      user_id: "e2e-user",
      title: "Original title",
      graph_mode: false,
      model: "claude-sonnet-4-6",
      ui_state: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  await page.goto("/");
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await expect(page.getByText("Original title")).toBeVisible();

  // Capture the rename request to confirm it fires as a PATCH.
  const patch = page.waitForRequest(
    (req) =>
      req.method() === "PATCH" && /\/api\/sessions\/sess-1$/.test(req.url())
  );

  // Open the kebab → Rename, type a new title, commit with Enter.
  await page.getByRole("button", { name: "Session options" }).first().click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const input = page.getByRole("textbox", { name: "Rename conversation" });
  await input.fill("Renamed conversation");
  await input.press("Enter");

  await patch;
  await expect(page.getByText("Renamed conversation")).toBeVisible();
});

test("delete a session from the sidebar drawer", async ({ page, mockApi }) => {
  mockApi.setSessions([
    {
      id: "sess-1",
      user_id: "e2e-user",
      title: "Doomed conversation",
      graph_mode: false,
      model: "claude-sonnet-4-6",
      ui_state: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  await page.goto("/");
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await expect(page.getByText("Doomed conversation")).toBeVisible();

  const del = page.waitForRequest(
    (req) =>
      req.method() === "DELETE" && /\/api\/sessions\/sess-1$/.test(req.url())
  );

  await page.getByRole("button", { name: "Session options" }).first().click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await del;
});
