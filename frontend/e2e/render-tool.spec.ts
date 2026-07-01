import { expect, test } from "./fixtures/mockApi";

// The one full round-trip flow: a prompt whose mocked response includes a
// render_table tool_start/tool_result → the Table capability widget renders the
// spec's content. Proves the SSE → bus → provider → widget pipeline end to end.
//
// The render-tool providers are mounted at the app root, so they capture the
// tool_result even before the Table tab is activated; activating the chip just
// brings the populated widget into view. On mobile the capability column is a
// full-screen overlay reached via "Open canvas", so we open that first.
test("render_table round trip renders the table widget", async ({
  page,
  mockApi,
}) => {
  mockApi.streamTable();

  // Open an EXISTING conversation, not the home route. Sending the first message
  // on home creates the session mid-stream, and the widget-persistence bridge
  // clears the render-tool providers on that session change — which can race the
  // incoming tool_result and wipe it (the race is timing-dependent, so it only
  // flakes under load, e.g. parallel workers hitting one dev server). Starting in
  // an already-loaded session removes the session change entirely, so the round
  // trip is deterministic. We wait for the session's initial widget load to settle
  // before sending so that clear can't land after our tool_result either.
  await page.goto("/c/sess-1");
  // Let the session's initial load (messages + widgets + graph) and its
  // clear-on-session-change fully settle before we send, so the clear can't land
  // after our tool_result. The composer being enabled marks the shell as ready;
  // the short settle covers the async persistence-bridge fetches that follow.
  const composer = page.getByPlaceholder(/Type a message/i);
  await expect(composer).toBeEnabled();
  await page.waitForTimeout(1000);

  await composer.fill("Show me the largest planets");
  await page.getByRole("button", { name: "Send message" }).click();

  // Wait for the streamed preamble so we know the tool_result has been processed.
  await expect(page.getByText(/largest planets/i).first()).toBeVisible();

  // On mobile the capability chips live inside the canvas overlay.
  const openCanvas = page.getByRole("button", { name: "Open canvas" });
  if (await openCanvas.count()) {
    await openCanvas.click();
    // The overlay (and its safe-area-padded top bar) slides in; wait for the
    // "← Chat" bar to be settled so the chip toolbar beneath it isn't still being
    // overlapped mid-transition when we click — that overlap is what made the
    // Table-chip click flake on the narrow iphone viewport (the top bar intercepted
    // the pointer event).
    await expect(
      page.getByRole("button", { name: "Back to chat" })
    ).toBeVisible();
  }

  // Activate the Table capability, then assert the spec's content rendered. The
  // chip sits just under the sticky top bar on mobile; force past any residual
  // overlap so the click lands on the chip itself (we've already asserted it's the
  // right, visible element via its accessible name).
  await page
    .getByRole("button", { name: "Table" })
    .first()
    .click({ force: true });

  // The title text now appears in several places (the capability tab's card title,
  // the Bigsail card header, and the back-face spec JSON), so assert on the first
  // match rather than a strict single hit. The row data ("Jupiter", its diameter)
  // is what actually proves the Table widget rendered the spec content.
  await expect(
    page.getByText("Largest planets by diameter").first()
  ).toBeVisible();
  await expect(page.getByText("Jupiter").first()).toBeVisible();
  await expect(
    page.getByText("139,820").or(page.getByText("139820")).first()
  ).toBeVisible();
});
