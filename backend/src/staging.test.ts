import { expect, test } from "bun:test";
import { isStagingParagraph, stripStagingChain } from "./staging";

test("recognizes staging lines, not real content", () => {
  expect(isStagingParagraph("Let me pull the revenue figures.")).toBe(true);
  expect(isStagingParagraph("I have solid photos. Let me render them.")).toBe(true);
  expect(isStagingParagraph("Now I have everything I need.")).toBe(true);
  // real content and structural markdown are never staging
  expect(isStagingParagraph("Modern logistics began as a business of paper.")).toBe(false);
  expect(isStagingParagraph("## The digital foundation")).toBe(false);
  expect(isStagingParagraph(":::pullquote")).toBe(false);
  // a long "Let me" paragraph is real prose, not a one-line remark
  expect(isStagingParagraph("Let me be clear about why this matters: ".padEnd(300, "x"))).toBe(false);
  // rhetorical "let me" openers are content, not staging — only "let me <do a thing>" is
  expect(isStagingParagraph("Let me be clear about the stakes here.")).toBe(false);
  expect(isStagingParagraph("Let me walk you through the three phases.")).toBe(false);
  expect(isStagingParagraph("Let me render the chart now.")).toBe(true);
});

test("catches apparatus meta-talk (sources, widget promises)", () => {
  // the real-world miss: narration that doesn't open with a staging phrase
  expect(
    isStagingParagraph(
      "The modern Scout EVs are too new to have Commons/Unsplash coverage, so the gallery will feature the classic International Scouts — but here's the full arc of the name."
    )
  ).toBe(true);
  expect(isStagingParagraph("No Wikidata results for that spelling, so I broadened the search.")).toBe(true);
  expect(isStagingParagraph("The gallery will feature the classic models.")).toBe(true);
  // a lede genuinely ABOUT a source, with no process word, is content
  expect(isStagingParagraph("Wikidata is a free, collaborative knowledge base run by the Wikimedia Foundation.")).toBe(false);
  // present-tense panel tissue keeps its treatment; only future promises are staging
  expect(isStagingParagraph("The chart below tracks GDP per capita since 1960.")).toBe(false);
  expect(isStagingParagraph("The World Bank estimates global poverty fell sharply after 1990.")).toBe(false);
});

test("strips the whole leading staging chain, keeps the answer", () => {
  const src = [
    "I'll build you the full picture — let me start by pulling some data.",
    "Let me grab a few more visuals while I write up the deep-dive.",
    "Modern logistics began as a business of paper, phone calls, and trust.",
    "## The digital foundation",
  ].join("\n\n");
  const out = stripStagingChain(src);
  expect(out.startsWith("Modern logistics began")).toBe(true);
  expect(out.includes("Let me")).toBe(false);
});

test("never blanks a pure-staging turn (no real content follows)", () => {
  const src = "Let me pull the figures.\n\nNow let me render the panels.";
  expect(stripStagingChain(src)).toBe(src);
});

test("leaves clean content untouched (idempotent backfill)", () => {
  const clean = "Modern logistics began as a business of paper.\n\n## Section\n\nMore.";
  expect(stripStagingChain(clean)).toBe(clean);
});
