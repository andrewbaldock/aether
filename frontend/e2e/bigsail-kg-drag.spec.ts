import { expect, test } from "./fixtures/mockApi";

// Mouse-drag semantics only — GridStack's touch path (dd-touch.js) is a separate
// code path from the mousedown handling this test guards, and the reported bug
// (and the fix) are about desktop mouse dragging. Scope to desktop-chrome, the
// only non-touch project in the matrix (see e2e/devices.ts).
// biome-ignore lint/correctness/noEmptyPattern: Playwright requires an object-destructuring first param to detect which fixtures a hook uses; empty means none
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "GridStack mouse-drag handling only; not the touch code path"
  );
});

// Regression test for the GridStack/Knowledge-Graph drag conflict. GridStack
// computes its drag `handle` (`.bigsail-card-drag`) at addWidget() time, when a
// grid item's portal content is still empty — if it finds no handle element yet,
// it falls back to treating the WHOLE card as draggable (see TilesCanvas.tsx's
// ddFixedIds fix, which forces a re-scan once real content has mounted). Without
// that fix, dragging a node in the graph moves the Bigsail panel instead of the
// node — d3-zoom's own filter already protects drags that start on empty canvas
// (see ForceGraph.tsx's `.filter()`), so the gesture has to originate on a
// `.kg-node` to actually hit the bug, which is what this test does.
//
// Looks the dragged item up by its stable `gs-id` attribute (not by containing
// the graph's <svg>) because GridStack's drag helper reparents/hides the item's
// live content while dragging, so an `svg`-containment locator would stop
// matching mid-gesture.
//
// Drives a real build_knowledge_graph round trip so a live GridStack item +
// ForceGraph SVG exist, then asserts: (a) dragging a node leaves the panel's
// screen position untouched (it's the node/graph that should react), and (b) a
// drag started on the titlebar strip still moves the panel — the fix must scope
// dragging correctly, not disable it.
test("dragging a Knowledge Graph node doesn't drag the Bigsail panel", async ({
  page,
  mockApi,
}) => {
  mockApi.streamGraph();

  // See render-tool.spec.ts for why: an existing session avoids the
  // session-creation race with the widget-persistence bridge's clear-on-change.
  await page.goto("/c/sess-1");
  const composer = page.getByPlaceholder(/Type a message/i);
  await expect(composer).toBeEnabled();
  await page.waitForTimeout(1000);

  await composer.fill("What connects these ideas?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/these ideas/i).first()).toBeVisible();

  const node = page.locator(".kg-node").first();
  await expect(node).toBeVisible();

  const gsId = await node.evaluate((el) =>
    el.closest(".grid-stack-item")?.getAttribute("gs-id")
  );
  if (!gsId) throw new Error("Knowledge Graph grid item has no gs-id");
  const item = page.locator(`[gs-id="${gsId}"]`);

  const nodeBox = await node.boundingBox();
  const itemBefore = await item.boundingBox();
  if (!nodeBox || !itemBefore) throw new Error("missing bounding box");

  // (a) Drag starting ON A NODE — the panel must not move.
  const nodeStartX = nodeBox.x + nodeBox.width / 2;
  const nodeStartY = nodeBox.y + nodeBox.height / 2;
  await page.mouse.move(nodeStartX, nodeStartY);
  await page.mouse.down();
  await page.mouse.move(nodeStartX + 60, nodeStartY + 40, { steps: 10 });
  const itemDuringNodeDrag = await item.boundingBox();
  await page.mouse.up();

  expect(itemDuringNodeDrag?.x).toBeCloseTo(itemBefore.x, 0);
  expect(itemDuringNodeDrag?.y).toBeCloseTo(itemBefore.y, 0);

  // (b) Drag on the titlebar strip — the panel SHOULD move (the fix must not
  // disable panel dragging outright, only correctly scope it to the handle).
  const handle = item.locator(".bigsail-card-drag").first();
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("missing handle bounding box");

  await page.mouse.move(
    handleBox.x + handleBox.width * 0.7,
    handleBox.y + handleBox.height * 0.5
  );
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 200, handleBox.y + 5, { steps: 10 });
  const itemDuringTitleDrag = await item.boundingBox();
  await page.mouse.up();

  expect(itemDuringTitleDrag?.x).not.toBeCloseTo(itemBefore.x, 0);
});
