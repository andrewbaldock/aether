import { describe, expect, it } from "vitest";
import { nextWaitingMessage, WAITING_MESSAGES } from "./waitingMessages";

describe("nextWaitingMessage", () => {
  it("always returns a member of the message list", () => {
    for (let i = 0; i < 200; i++) {
      expect(WAITING_MESSAGES).toContain(nextWaitingMessage());
    }
  });

  it("never immediately repeats the previous line", () => {
    let prev = nextWaitingMessage();
    for (let i = 0; i < 500; i++) {
      const next = nextWaitingMessage(prev);
      expect(next).not.toBe(prev);
      expect(WAITING_MESSAGES).toContain(next);
      prev = next;
    }
  });

  it("returns a valid line even when previous is unknown to the list", () => {
    const out = nextWaitingMessage("something that was never in the list");
    expect(WAITING_MESSAGES).toContain(out);
  });
});
