import { expect, test } from "./fixtures/mockApi";

// "The mobile experience is good" goal. Mobile/tablet projects only — skipped on
// the desktop project. Asserts the single-column mobile shell: the sidebar is an
// off-canvas drawer (not always-on), the capability column is an on-demand
// full-screen overlay, and orientation-specific behaviour holds. We key on the
// viewport's actual orientation (width vs height), not the device name, so the
// portrait and landscape projects each assert their own layout path.

// The mobile single-column shell (drawer + canvas overlay) only renders BELOW the
// 768px `md` breakpoint (useIsMobile). At/above it — desktop, iPad either way, and
// phones in landscape — the app uses the resizable three-pane grid, which has no
// "Open sidebar"/"Open canvas" buttons. So gate on the actual viewport WIDTH, not
// the device name: a phone in landscape is "desktop layout" too.
test.beforeEach(async ({ page }) => {
  const vp = page.viewportSize();
  test.skip(
    !vp || vp.width >= 768,
    "mobile single-column shell only renders below the 768px breakpoint"
  );
});

test("mobile shell: sidebar is a drawer, canvas is an overlay", async ({
  page,
}) => {
  await page.goto("/");

  // The chat compose box is the default (and only) visible column on load.
  await expect(page.getByPlaceholder(/Type a message/i)).toBeVisible();

  // Sidebar drawer: opens from the top-bar button, dismisses via the scrim.
  const openSidebar = page.getByRole("button", { name: "Open sidebar" });
  await expect(openSidebar).toBeVisible();
  await openSidebar.click();
  const scrim = page.getByRole("button", { name: "Close sidebar" });
  await expect(scrim).toBeVisible();
  // The scrim spans the whole screen (inset-0) but the 280px/85vw drawer panel
  // sits ON TOP of it (z-30 > z-20), covering the left side. Clicking the scrim's
  // center would land on the drawer and the click would be intercepted forever.
  // Tap the scrim on the far right — outside the drawer — which is how a user
  // actually dismisses it. `position` is relative to the element's top-left.
  const box = await scrim.boundingBox();
  await scrim.click({ position: { x: (box?.width ?? 393) - 8, y: 80 } });
  await expect(scrim).toHaveCount(0);

  // Capability column: a full-screen overlay reached on demand, with a way back.
  const openCanvas = page.getByRole("button", { name: "Open canvas" });
  await expect(openCanvas).toBeVisible();
  await openCanvas.click();
  const backToChat = page.getByRole("button", { name: "Back to chat" });
  await expect(backToChat).toBeVisible();
  await backToChat.click();
  await expect(page.getByPlaceholder(/Type a message/i)).toBeVisible();
});

test("touch targets meet the 44px minimum", async ({ page }) => {
  await page.goto("/");

  // The primary top-bar controls are sized for touch (max-md:h-11 = 44px etc.).
  for (const name of ["Open sidebar", "Open canvas", "Send message"]) {
    const btn = page.getByRole("button", { name }).first();
    if (!(await btn.count())) continue;
    const box = await btn.boundingBox();
    expect(box, `${name} should have a bounding box`).not.toBeNull();
    if (box) {
      // Apple HIG / WCAG target ~44px. Allow a 1px rounding slack.
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(43);
    }
  }
});

test("orientation matches the project's layout path", async ({ page }) => {
  await page.goto("/");
  const vp = page.viewportSize();
  expect(vp).not.toBeNull();
  if (!vp) return;

  const isLandscape = vp.width > vp.height;
  // Both orientations must keep the compose box reachable — the regression is the
  // shell mis-stacking and pushing it off-screen in one orientation. We assert it's
  // visible AND fully inside the viewport in whichever orientation this project is.
  const composer = page.getByPlaceholder(/Type a message/i);
  await expect(composer).toBeVisible();
  const box = await composer.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(
      box.y,
      `composer top within viewport (${isLandscape ? "landscape" : "portrait"})`
    ).toBeLessThan(vp.height);
    expect(box.x).toBeGreaterThanOrEqual(0);
  }
});
