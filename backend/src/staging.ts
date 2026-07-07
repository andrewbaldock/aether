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

// Structural markdown that must never be mistaken for a staging line.
const STRUCTURAL = /^(#{1,6}\s|:::|::[a-z]|>|[-*]\s|\d+[.)]\s|\||---|!\[)/i;

export function isStagingParagraph(paragraph: string): boolean {
  const t = paragraph.trim();
  if (!t || t.length > 240) return false;
  if (STRUCTURAL.test(t)) return false;
  return STAGING_OPENER.test(t) || LET_ME_ACTION.test(t);
}

// Remove the leading run of staging paragraphs — but ONLY when real content
// follows. A turn with no substantive paragraph (a pure-staging legacy turn) is
// left untouched rather than blanked (which would fail the non-empty persist rule
// and load as an empty bubble).
export function stripStagingChain(content: string): string {
  const paras = content.split(/\n\s*\n/);
  const firstReal = paras.findIndex((p) => !isStagingParagraph(p));
  if (firstReal <= 0) return content; // no leading staging, or nothing but staging
  return paras.slice(firstReal).join("\n\n").trim() || content;
}
