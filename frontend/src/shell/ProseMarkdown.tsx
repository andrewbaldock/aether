import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";

// ProseMarkdown — the editorial renderer for an assistant message. It does two
// jobs the old inline <ReactMarkdown> in ChatPanel didn't:
//
//  1. Sets the markdown Claude already writes like a designed page. A wrapping
//     .prose-editorial element (styled in index.css) turns headings into a real
//     hierarchy, `---` into a lotus divider, blockquotes into pull-quotes, images
//     into figures. Substantial answers get data-variant="article" (larger
//     measure + a standfirst lead paragraph with a drop cap); short replies stay
//     in the compact variant, so a one-line answer never gets an absurd drop cap.
//
//  2. Gives Claude an art-direction palette via markdown directives (remark-
//     directive): :::lead, :::aside, :::callout, :::pullquote, ::stat, :accent.
//     Each maps to a data-directive marker rendered by the components below.
//     Unknown/malformed directives degrade to plain content — a stray ::: never
//     leaks literal colons (see remarkDirectiveElements).

// An answer earns the full editorial treatment when it's substantial: it has a
// heading, uses a directive, or is simply long. Short chat replies and one-line
// clarifiers fall through to the compact variant.
function isArticle(text: string): boolean {
  return (
    /^#{1,6}\s/m.test(text) || // has a markdown heading
    /(^|\n):{2,}/.test(text) || // uses a block/leaf directive (:::x or ::x)
    text.trim().length > 320 // long enough to read as a piece
  );
}

// Claude opens a turn with a one-line process announcement before its tool calls
// ("Now let me build the full response…", "Let me pull the population figures…").
// That's chatter, not the article — it must NOT get the drop cap / standfirst.
// Split it off so it renders as a quiet muted note and the editorial treatment
// lands on the first real content paragraph instead.
function splitPreamble(text: string): {
  preamble: string | null;
  body: string;
} {
  const trimmed = text.replace(/^\s+/, "");
  // A short lead-in before the first heading is a preamble (the content starts
  // at the heading). Single paragraph, kept short so we don't swallow real prose.
  const headingIdx = trimmed.search(/^#{1,6}\s/m);
  if (headingIdx > 0) {
    const before = trimmed.slice(0, headingIdx).trim();
    if (before && before.length <= 220 && !/\n\s*\n/.test(before)) {
      return { preamble: before, body: trimmed.slice(headingIdx) };
    }
  }
  // Otherwise: a short opening "Let me…/Now let me…/I'll…" line is an
  // announcement, even when it's momentarily the only text (mid-stream).
  const brk = trimmed.search(/\n\s*\n/);
  const first = (brk === -1 ? trimmed : trimmed.slice(0, brk)).trim();
  if (
    first.length <= 200 &&
    /^(now\s+)?(let me|let['’]s|i['’]ll|i will)\b/i.test(first)
  ) {
    return {
      preamble: first,
      body: brk === -1 ? "" : trimmed.slice(brk).trim(),
    };
  }
  return { preamble: null, body: trimmed };
}

// remark plugin: convert remark-directive's directive nodes into ordinary
// elements (div for blocks, span for inline) tagged with data-directive, so the
// `components` map below can style the ones we know and pass the rest through.
// Recurses so directives nested inside a container are handled too.
function remarkDirectiveElements() {
  // biome-ignore lint/suspicious/noExplicitAny: mdast tree
  return (tree: any) => walk(tree);
}
// biome-ignore lint/suspicious/noExplicitAny: mdast node
function walk(node: any) {
  if (!node || !Array.isArray(node.children)) return;
  for (const child of node.children) {
    const kind = child.type as string;
    if (
      kind === "containerDirective" ||
      kind === "leafDirective" ||
      kind === "textDirective"
    ) {
      const inline = kind === "textDirective";
      const known = inline ? INLINE_DIRECTIVES : BLOCK_DIRECTIVES;
      const attrs = (child.attributes || {}) as Record<string, string>;
      if (!child.data) child.data = {};
      const data = child.data;
      const directive = known.has(child.name) ? child.name : null;
      data.hName = inline ? "span" : "div";
      data.hProperties = {
        "data-directive": directive ?? (inline ? "__inline" : "__block"),
        // Carried through for the components map. For an UNKNOWN inline directive
        // we stash the name so it can be reconstructed as `:name` — otherwise a
        // bare `:word` (e.g. "namespace:function") would silently drop its text.
        "data-name": child.name,
        "data-title": attrs.title,
        "data-cite": attrs.cite,
        "data-label": attrs.label,
      };
    }
    walk(child);
  }
}

// Containers (:::x) and the one leaf directive (::stat) both render as block
// <div>s; `accent` is the only inline (:x) directive.
const BLOCK_DIRECTIVES = new Set([
  "lead",
  "aside",
  "callout",
  "pullquote",
  "stat",
]);
const INLINE_DIRECTIVES = new Set(["accent"]);

// biome-ignore lint/suspicious/noExplicitAny: react-markdown passes hProperties through as loosely-typed props
type P = Record<string, any>;

const components: Components = {
  // Links open in a new tab; styling is in the .prose-editorial CSS block.
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  // Images become captioned figures. A <span> (not <figure>) keeps this valid
  // when react-markdown nests the image inside a <p>; CSS makes it block-level.
  img: ({ src, alt }) => (
    <span className="prose-figure">
      <img src={typeof src === "string" ? src : undefined} alt={alt || ""} />
      {alt ? <span className="prose-figcaption">{alt}</span> : null}
    </span>
  ),
  // All BLOCK directives route here (see remarkDirectiveElements). Markdown never
  // emits a raw <div> on its own (no rehype-raw), so this only ever sees ours.
  div: (props) => {
    const { children } = props as P;
    const p = props as P;
    switch (p["data-directive"]) {
      case "lead":
        return <div className="prose-lead">{children}</div>;
      case "aside":
        return <aside className="prose-aside">{children}</aside>;
      case "callout":
        return (
          <div className="prose-callout">
            {p["data-title"] ? (
              <div className="prose-callout-title">{p["data-title"]}</div>
            ) : null}
            {children}
          </div>
        );
      case "pullquote":
        return (
          <figure className="prose-pullquote">
            <blockquote>{children}</blockquote>
            {p["data-cite"] ? (
              <figcaption>— {p["data-cite"]}</figcaption>
            ) : null}
          </figure>
        );
      case "stat":
        return (
          <div className="prose-stat">
            <span className="prose-stat-value">{children}</span>
            {p["data-label"] ? (
              <span className="prose-stat-label">{p["data-label"]}</span>
            ) : null}
          </div>
        );
      default:
        // Unknown/malformed block directive: drop the wrapper, keep the content.
        return <>{children as ReactNode}</>;
    }
  },
  // All INLINE directives route here.
  span: (props) => {
    const p = props as P;
    const { children } = p;
    if (p["data-directive"] === "accent") {
      return <span className="prose-accent">{children}</span>;
    }
    if (p["data-directive"] === "__inline") {
      // Unknown inline directive — reconstruct `:name` so no text is lost.
      return (
        <>
          {`:${p["data-name"] ?? ""}`}
          {children as ReactNode}
        </>
      );
    }
    return <>{children as ReactNode}</>;
  },
};

export function ProseMarkdown({ text }: { text: string }) {
  const { preamble, body } = splitPreamble(text);
  return (
    <div
      className="prose-editorial"
      data-variant={isArticle(body) ? "article" : "compact"}
    >
      {preamble ? <p className="prose-preamble">{preamble}</p> : null}
      {/* The article treatment (drop cap, standfirst) targets .prose-body's first
          paragraph, so the muted preamble above never gets dressed up. */}
      <div className="prose-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkDirective, remarkDirectiveElements]}
          components={components}
        >
          {body}
        </ReactMarkdown>
      </div>
    </div>
  );
}
