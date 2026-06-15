// Outbound links to the maker's portfolio site (andrewbaldock.com) and the Aether
// source. Aether and the portfolio site are developed together and run side by side
// in dev, so when we're local these point at the website's dev server (port 5173)
// instead of the live domain. This is the single source of truth — update a URL here
// and every link in the app (Sidebar footer, Welcome byline + case study) follows.
//
// The dev/prod split keys on Vite's compile-time `import.meta.env.DEV` flag, the same
// signal queryClient.ts uses to describe where /api goes.

// Portfolio homepage: localhost:5173 in dev, the live domain in prod.
export const SITE_URL = import.meta.env.DEV
  ? "http://localhost:5173"
  : "https://andrewbaldock.com";

// Aether case study, served under the portfolio site at /aether.
export const CASE_STUDY_URL = `${SITE_URL}/aether`;

// Aether source on GitHub — static, no dev/prod split.
export const REPO_URL = "https://github.com/andrewbaldock/aether";

// Guard a model-/data-supplied URL before it becomes an <a href>. Image credits
// and knowledge-graph node links carry URLs the model or an external API produced,
// so a `javascript:`/`data:`/`vbscript:` href could smuggle script into a click.
// Returns the URL only when it parses as http(s); otherwise undefined (render no
// href / a disabled link). Protocol-relative and relative URLs resolve against the
// current origin via the URL constructor, so they're judged on their final scheme.
export function safeHref(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}
