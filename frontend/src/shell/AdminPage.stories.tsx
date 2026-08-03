import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AdminPage } from "./AdminPage";
import { Button } from "./Button";
import { SessionProvider } from "./SessionContext";

// AdminPage renders <AdminTabs>, which is URL-driven and reads the session
// context — so the story needs the real providers. SessionProvider fetches the
// conversation list on mount, so `fetch` is stubbed to answer /api/* with an
// empty array: the story stays hermetic and never emits a failed request.
function AdminChrome({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === "string" ? input : (input as Request).url
    );
    if (url.includes("/api/")) {
      return Promise.resolve(
        new Response("[]", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;

  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <div className="h-[38rem] overflow-hidden rounded-lg border border-border">
          {children}
        </div>
      </SessionProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Widgets/AdminPage",
  component: AdminPage,
  parameters: {
    docs: {
      description: {
        component: [
          "**The system's other shared shell.** `CardShell` gives every Bigsail widget its chrome; `AdminPage` does the same job for every utility page — Welcome, Settings, Health, Metrics, Style Guide, Theme Lab.",
          "",
          "### The bug it was built to fix",
          "Each admin page used to roll its own scroll container, max-width, padding, tab-bar slot, and heading size. The result was that *navigating between them made the column jump* — the width changed, the tab bar slid up or down, the title resized. Individually each page looked fine; the system only failed in the transition between them, which is exactly the class of bug a shared shell exists to prevent.",
          "",
          "### The px max-width is deliberate, and counter-intuitive",
          "The default width is `max-w-[672px]` — a **pixel** value, not the `max-w-2xl` rem token you'd expect. Text size is applied via the root `<html>` font-size, so a rem-based max-width scaled *with* the user's text-size setting: clicking XS/S/M/L on the Settings page snapped the whole column between 588px and 756px. 672px is exactly 42rem at the default 16px, so it's visually identical at M and now holds steady at every size.",
          "",
          "That's the kind of thing a token system gets wrong by being *too* consistent — rem is right for type and spacing, and wrong for a measure that must not respond to type scale.",
          "",
          "### API",
          "`title`, an optional `actions` slot for right-aligned controls (Health's \"Check now\", the Style Guide's theme toggle), and `width` for pages that need a wider column — galleries pass `max-w-5xl`. Screenshots deliberately opts *out* of the wrapper because it needs full width, but still mirrors the outer container and tab slot so its tab bar lines up with everyone else's.",
          "",
          "> The tab bar is live: these stories mount the real `AdminTabs`, which reads the URL. Clicking a tab navigates the Storybook iframe.",
        ].join("\n"),
      },
    },
  },
  args: { title: "Settings" },
  argTypes: { children: { control: false }, actions: { control: false } },
  decorators: [
    (Story) => (
      <AdminChrome>
        <Story />
      </AdminChrome>
    ),
  ],
} satisfies Meta<typeof AdminPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const Body = () => (
  <div className="mt-6 flex flex-col gap-4">
    <p className="text-sm text-content-muted">
      Page content goes here. The shell owns the scroll container, the column
      width, the padding, the tab bar, and the heading — a page implements only
      this.
    </p>
    <div className="rounded-lg border border-border bg-surface-raised p-4 text-sm text-content-muted">
      A settings panel.
    </div>
  </div>
);

/** The default column width — the one every text/form page uses. */
export const Default: Story = { args: { children: <Body /> } };

/** `actions` puts controls beside the title, aligned right. */
export const WithActions: Story = {
  args: {
    title: "Health",
    actions: <Button variant="secondary">Check now</Button>,
    children: <Body />,
  },
};

/** A wider column, for pages whose content isn't prose — galleries, grids. */
export const WideColumn: Story = {
  args: {
    title: "Screenshots",
    width: "max-w-5xl",
    children: (
      <div className="mt-6 grid grid-cols-3 gap-3">
        {["a", "b", "c", "d", "e", "f"].map((k) => (
          <div
            key={k}
            className="flex h-28 items-center justify-center rounded-lg border border-border bg-surface-raised text-xs text-content-muted"
          >
            tile {k}
          </div>
        ))}
      </div>
    ),
  },
};
