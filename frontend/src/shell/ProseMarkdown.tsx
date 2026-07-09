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

// Claude opens (and, across an agent loop, punctuates) a turn with process
// narration before its tool calls — "Now let me build the full response…", "Let me
// pull the figures…", "I have the photos. Let me render them." That's scaffolding,
// not the article: it must NOT get the drop cap / standfirst. New turns no longer
// persist it (the backend keeps only the answer), but it still streams live and
// lives in legacy transcripts, so we peel the WHOLE leading chain off here and
// render it as quiet muted notes, leaving the editorial treatment for the first
// real content paragraph. Mirrors backend/src/staging.ts (kept conservative — only
// clearly self-narrating, short, leading paragraphs).
const STAGING_OPENER =
  /^(let['’]s\b|i['’]ll\b|i will\b|i['’]ve\b|i have\b|i['’]m (?:going|about) to\b|now (?:let me|i)\b|okay[,\s]|ok[,\s]|alright[,\s]|first,\s|sure[,\s]|great[,\s])/i;
const LET_ME_ACTION =
  /\blet me (?:pull|grab|get|fetch|build|render|chart|map|assemble|gather|start|dig|look|search|find|check|put together|pull up|run|query|surface|show)\b/i;
// Meta-talk about the answer's own machinery ("…too new to have Commons/Unsplash
// coverage, so the gallery will feature…"). Source names only count alongside a
// process word, so a lede genuinely ABOUT Wikidata isn't swallowed; widget promises
// are future-tense only ("will"), so present-tense tissue ("the chart below shows")
// keeps its editorial treatment.
const SOURCE_NAME = /\b(?:wikimedia|unsplash|wikidata|openalex|world bank)\b/i;
const PROCESS_WORD =
  /\b(?:coverage|search(?:es|ed|ing)?|results?|images?|photos?|galler(?:y|ies)|render(?:s|ed|ing)?|fetch(?:ed|ing)?)\b/i;
const WIDGET_PROMISE =
  /\bthe (?:galler(?:y|ies)|charts?|tables?|timelines?|graphs?|panels?) will\b/i;
const STRUCTURAL = /^(#{1,6}\s|:::|::[a-z]|>|[-*]\s|\d+[.)]\s|\||---|!\[)/i;
function isStagingParagraph(paragraph: string): boolean {
  const t = paragraph.trim();
  if (!t || t.length > 240) return false;
  if (STRUCTURAL.test(t)) return false;
  if (STAGING_OPENER.test(t) || LET_ME_ACTION.test(t)) return true;
  return (SOURCE_NAME.test(t) && PROCESS_WORD.test(t)) || WIDGET_PROMISE.test(t);
}
function splitPreamble(text: string): {
  preamble: string[];
  body: string;
} {
  const trimmed = text.replace(/^\s+/, "");
  const paras = trimmed.split(/\n\s*\n/);
  let i = 0;
  while (i < paras.length && isStagingParagraph(paras[i] ?? "")) i++;
  if (i === 0) return { preamble: [], body: trimmed };
  return {
    preamble: paras.slice(0, i).map((p) => p.trim()),
    body: paras.slice(i).join("\n\n"),
  };
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
      {preamble.map((line, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: staging lines have no id and never reorder
        <p key={idx} className="prose-preamble">
          {line}
        </p>
      ))}
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
