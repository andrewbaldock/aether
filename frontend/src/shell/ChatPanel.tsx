import { type FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChat } from "./useChat";

export function ChatPanel() {
  const { messages, sendMessage, isLoading, error } = useChat();
  const [draft, setDraft] = useState("");
  const [started, setStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are triggers, not values the effect reads
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  function submit() {
    const text = draft.trim();
    if (!text || isLoading) return;
    setStarted(true);
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

  return (
    <div className="relative flex h-full flex-col bg-neutral-900">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {!started && (
          <div className="mx-auto mt-20 max-w-md text-center">
            <div className="text-2xl font-medium text-neutral-200">
              Ask Aether
            </div>
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
                {m.role === "user" ? (
                  m.text
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      h1: ({ children }) => <h1 className="mb-2 text-base font-semibold">{children}</h1>,
                      h2: ({ children }) => <h2 className="mb-2 text-sm font-semibold">{children}</h2>,
                      h3: ({ children }) => <h3 className="mb-1 text-sm font-medium">{children}</h3>,
                      ul: ({ children }) => <ul className="mb-2 list-disc pl-4 space-y-0.5">{children}</ul>,
                      ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 space-y-0.5">{children}</ol>,
                      li: ({ children }) => <li>{children}</li>,
                      code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
                        inline ? (
                          <code className="rounded bg-neutral-700 px-1 py-0.5 font-mono text-xs">{children}</code>
                        ) : (
                          <code>{children}</code>
                        ),
                      pre: ({ children }) => (
                        <pre className="mb-2 overflow-x-auto rounded-lg bg-neutral-900 p-3 font-mono text-xs">{children}</pre>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="mb-2 border-l-2 border-neutral-500 pl-3 text-neutral-400">{children}</blockquote>
                      ),
                      a: ({ href, children }) => (
                        <a href={href} className="underline hover:text-neutral-100" target="_blank" rel="noreferrer">{children}</a>
                      ),
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      hr: () => <hr className="my-2 border-neutral-600" />,
                    }}
                  >
                    {m.text}
                  </ReactMarkdown>
                )}
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

      <form
        onSubmit={handleSubmit}
        className={
          started
            ? "border-t border-neutral-800 p-4 transition-all duration-600 ease-in-out"
            : "absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 transition-all duration-600 ease-in-out"
        }
      >
        <div
          className={`relative mx-auto rounded-lg border border-neutral-700 bg-neutral-800 focus-within:border-neutral-500 transition-colors ${started ? "max-w-2xl" : "max-w-md"}`}
        >
          <textarea
            ref={textareaRef}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Shift+Enter for newline)"
            rows={1}
            className={`w-full resize-none bg-transparent px-4 pt-3 pb-10 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none transition-opacity${isLoading ? " opacity-50" : ""}${started ? "" : " min-h-24"}`}
          />
          <button
            type="submit"
            className="absolute bottom-2 right-2 rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-40"
            disabled={draft.trim().length === 0 || isLoading}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
