import { type FormEvent, useEffect, useRef, useState } from "react";
import { useCapabilities } from "../capabilities/useCapabilities";
import { useChat } from "./useChat";

export function ChatPanel() {
  const { messages, sendMessage, isLoading, error } = useChat();
  const [draft, setDraft] = useState("");
  const { open, isOpen } = useCapabilities();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  function submit() {
    const text = draft.trim();
    if (!text || isLoading) return;
    setDraft("");
    sendMessage(text);
    textareaRef.current?.focus();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
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
        {messages.length === 0 && (
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
        )}
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
          {isLoading && (
            <li className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl bg-neutral-800 px-4 py-2 text-sm text-neutral-500 italic">
                Aether is thinking…
              </div>
            </li>
          )}
          {error && (
            <li className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl bg-red-900/40 px-4 py-2 text-sm text-red-300">
                {error}
              </div>
            </li>
          )}
        </ul>
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-neutral-800 p-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Shift+Enter for newline)"
            rows={1}
            className={`flex-1 resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none transition-opacity${isLoading ? " opacity-50" : ""}`}
          />
          <button
            type="submit"
            className="rounded-lg bg-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-40"
            disabled={draft.trim().length === 0 || isLoading}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
