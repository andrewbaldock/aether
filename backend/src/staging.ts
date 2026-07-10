// "Staging remarks" are the model's pre-tool process narration — "Now let me pull
// the figures…", "I have the photos. Let me render them." — scaffolding, not the
// answer. New turns no longer persist them (the chat handler keeps only the text
// from render-bearing/terminal iterations; see index.ts). This module strips the
// LEADING chain of such lines from OLD stored content, so legacy conversations
// clean themselves the next time they're loaded (see GET /api/sessions/:id/messages).
//
// Deliberately conservative: only clearly self-narrating paragraphs, short, and
// only from the very top. New turns are classified deterministically by tool type,
// so this text heuristic only has to handle legacy rows and never needs to be
// aggressive.

// Clear self-narration openers. "let me" is deliberately NOT bare here — a leading
// "Let me be clear…/Let me explain…" is real content; only "let me <do-a-thing>"
// (LET_ME_ACTION) is staging.
const STAGING_OPENER =
  /^(let['’]s\b|i['’]ll\b|i will\b|i['’]ve\b|i have\b|i['’]m (?:going|about) to\b|now (?:let me|i)\b|okay[,\s]|ok[,\s]|alright[,\s]|first,\s|sure[,\s]|great[,\s])/i;
const LET_ME_ACTION =
  /\blet me (?:pull|grab|get|fetch|build|render|chart|map|assemble|gather|start|dig|look|search|find|check|put together|pull up|run|query|surface|show)\b/i;

// Meta-talk about the answer's own machinery. Naming the data/image plumbing
// (a reader-facing article never says "Unsplash") only counts when a process word
// (coverage, search, gallery…) co-occurs, so a lede that's genuinely ABOUT
// Wikidata isn't swallowed. "The gallery will feature…" (future-tense promise
// about a widget) is staging; "the chart below shows…" (present-tense tissue) is not.
const SOURCE_NAME = /\b(?:wikimedia|unsplash|wikidata|openalex|world bank)\b/i;
const PROCESS_WORD =
  /\b(?:coverage|search(?:es|ed|ing)?|results?|images?|photos?|galler(?:y|ies)|render(?:s|ed|ing)?|fetch(?:ed|ing)?)\b/i;
const WIDGET_PROMISE =
  /\bthe (?:galler(?:y|ies)|charts?|tables?|timelines?|graphs?|panels?) will\b/i;

// Structural markdown that must never be mistaken for a staging line.
const STRUCTURAL = /^(#{1,6}\s|:::|::[a-z]|>|[-*]\s|\d+[.)]\s|\||---|!\[)/i;

export function isStagingParagraph(paragraph: string): boolean {
  const t = paragraph.trim();
  if (!t || t.length > 240) return false;
  if (STRUCTURAL.test(t)) return false;
  if (STAGING_OPENER.test(t) || LET_ME_ACTION.test(t)) return true;
  return (SOURCE_NAME.test(t) && PROCESS_WORD.test(t)) || WIDGET_PROMISE.test(t);
}

// Remove the leading run of staging paragraphs — but ONLY when real content
// follows. A turn with no substantive paragraph (a pure-staging legacy turn) is
// left untouched rather than blanked (which would fail the non-empty persist rule
// and load as an empty bubble).
export function stripStagingChain(content: string): string {
  // Leading whitespace (e.g. the loop's injected "\n\n" separator surviving a
  // dropped first iteration) would make paras[0] the empty string — never staging —
  // and bail the whole strip. Trim first; mirrors splitPreamble frontend-side.
  const paras = content.replace(/^\s+/, "").split(/\n\s*\n/);
  const firstReal = paras.findIndex((p) => !isStagingParagraph(p));
  if (firstReal <= 0) return content; // no leading staging, or nothing but staging
  return paras.slice(firstReal).join("\n\n").trim() || content;
}
