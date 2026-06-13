import { expect, test } from "./fixtures/mockApi";

// The #1 regression path: send a message, watch the mocked SSE stream the reply
// in, then the stop path (send → stop mid-stream → streaming halts via the
// AbortController). Runs on every viewport.

test("type → send → assistant reply streams in", async ({ page, mockApi }) => {
  mockApi.streamText("The mocked assistant reply.");
  await page.goto("/");

  const composer = page.getByPlaceholder(/Type a message/i);
  await composer.fill("Hello there");
  await page.getByRole("button", { name: "Send message" }).click();

  // The user's bubble appears immediately, and the streamed assistant text lands.
  // "Hello there" also becomes the provisional sidebar title, so match the bubble
  // by taking the last occurrence (the transcript) — .first() would be the sidebar.
  await expect(page.getByText("Hello there").last()).toBeVisible();
  await expect(page.getByText("The mocked assistant reply.")).toBeVisible();
});

test("send → stop mid-stream halts the turn", async ({ page, mockApi }) => {
  // Hold the chat response open so the request stays in flight (isLoading stays
  // true) and the Send button becomes a Stop control. The fixture still mocks the
  // session routes the app loads on mount.
  const release = mockApi.holdChat();

  await page.goto("/");
  const composer = page.getByPlaceholder(/Type a message/i);
  await composer.fill("Start a long answer");
  await page.getByRole("button", { name: "Send message" }).click();

  // While the request hangs, the control flips to Stop (isLoading && empty field).
  const stop = page.getByRole("button", { name: "Stop generating" });
  await expect(stop).toBeVisible();

  // Hitting stop aborts the in-flight fetch; the control returns to Send mode.
  await stop.click();
  await expect(
    page.getByRole("button", { name: "Send message" })
  ).toBeVisible();
  await expect(stop).toHaveCount(0);

  // Let the held request finish so teardown isn't blocked on it.
  release();
});
