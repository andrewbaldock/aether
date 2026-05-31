import { type FormEvent, useState } from "react";
import { useCapabilities } from "../capabilities/useCapabilities";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

// Middle zone: transcript + composer. Local state only — no backend yet. The demo
// buttons open capability widgets so the three-zone behavior is usable now.
export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const { open, isOpen } = useCapabilities();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text },
    ]);
    setDraft("");
  }

  function openDemoWidget() {
    const n = Date.now().toString().slice(-4);
    open({
      id: crypto.randomUUID(),
      type: "placeholder",
      title: `Widget ${n}`,
      state: "Opened from the chat — try tabs, resize, and fullscreen.",
    });
  }

  return (
    <div className="flex h-full flex-col bg-neutral-900">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <div className="mx-auto mt-20 max-w-md text-center">
            <div className="text-2xl font-medium text-neutral-200">
              Ask Aether
            </div>
            <p className="mt-2 text-sm text-neutral-500">
              The chat is the interface. Answers appear here — and in the
              capability column when a visual fits best.
            </p>
            <button
              type="button"
              onClick={openDemoWidget}
              className="mt-6 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
            >
              {isOpen ? "Open another widget" : "Open a capability widget"}
            </button>
          </div>
        ) : (
          <ul className="mx-auto max-w-2xl space-y-4">
            {messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.role === "user" ? "flex justify-end" : "flex justify-start"
                }
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[80%] rounded-2xl bg-neutral-100 px-4 py-2 text-sm text-neutral-900"
                      : "max-w-[80%] rounded-2xl bg-neutral-800 px-4 py-2 text-sm text-neutral-200"
                  }
                >
                  {m.text}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-neutral-800 p-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-40"
            disabled={draft.trim().length === 0}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
