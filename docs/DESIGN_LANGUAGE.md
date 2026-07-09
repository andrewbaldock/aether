# Design Language

The *why* behind Aether's surface. [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) is the
engineering companion — how the tokens, shells, and motion are wired. This
document is the design intent those mechanics serve: the concept, the choices, the
reasons, and the principles that decide the next choice.

The visual direction was set up front — logo studies and a wordmark type-off,
preserved in [`design/`](../design/) — then formalized into the token system and
shared shells that carry it consistently across the app.

---

## Origin — a little cyberpunk edge, delivered by color

The starting brief was small and specific: give a clean AI tool **a little
cyberpunk edge** — enough character to feel like it has a point of view, not so
much that it fights the content.

The first attempt chased it with *texture* — CRT scanlines laid over the logo. In
practice they just went blurry, so that idea was cut. The edge moved to **color
instead:** a **neon pink → electric blue** accent, which carries the cyberpunk
charge cleanly at any size without the mush. That pivot — from a texture that
didn't survive contact to a color signal that did — set the whole approach:
**restraint on the surface, character in the accent.**

Around that accent sit a few deliberate flourishes with a hint of punk to them —
a gothic wordmark, a Warhol-style thinking glyph, a lotus bullet — each covered
below. The surfaces themselves stay plain on purpose (next section), so those
moments land.

---

## The premise

Aether is a conversational explorer: you ask, and it answers in **two registers at
once** — a written answer *typeset like an article* on the left, and a *tiled canvas
of visualizations* on the right, both composed from the same reply.

```
╭─ THE ANSWER · a typeset page ───╮   ╭─ THE CANVAS · a tiled field ────────╮
│                                 │   │                                     │
│   ┌─────────────────────────┐   │   │   ◍ knowledge graph    ▁▃▅▇ chart   │
│   │  standfirst lead-in     │   │   │     ○─◍─○─○            ▁▄▂▇▅▃▆      │
│   └─────────────────────────┘   │   │      │  ╲                           │
│    ┌┐                           │   │     ○   ◍         ├─┼─┼─ timeline   │
│    │A│ drop-capped body that    │   │                                     │
│    └┘  reads like a page —      │   │   ▤ figure        ▦ table           │
│        hairline rules, pulled   │   │                     ──────────────  │
│        quotes, 𑁍 lotus bullets  │   │                     ──────────────  │
│                                 │   │                     ──────────────  │
│   ›  ask again…                 │   │                                     │
╰─────────────────────────────────╯   ╰─────────────────────────────────────╯
       the reading register         𑁍        the discovery register
```

Picture a lavish encyclopedia built for *discovery-delight* — or Neal Stephenson's
[Young Lady's Illustrated Primer](https://en.wikipedia.org/wiki/The_Diamond_Age), the
book in *The Diamond Age* that answers you, adapts, and shows as much as it tells. The
**left pane is the reading register** — the answer set as an editorial page, drop cap
and all (see *Editorial prose*). The **right pane is the discovery register** — a
tiled canvas where knowledge graphs, timelines, images, charts, and tables render that
same answer in forms you can *see*, drag, and retune.

Two jobs, two surfaces, one reply. Almost every choice in this document is downstream
of that split — the shorthand for it, used throughout, is **two panes, two jobs.**


---

## Color — plain surfaces, an accent that unites

The surface strategy is deliberately unremarkable: **simple light and dark themes
that get out of your way.** Dense data and long reading are the point, so the
ground behind them stays quiet. What ties the whole app together — and carries the
cyberpunk edge — is the **accent, threaded through everywhere:**

- **Neon pink `#ff2e9a`** is the signal. It marks the user's own voice (their chat
  bubble), the Send action, the active state, the lotus. It never decorates; it
  always *means* "this is you, or this is live."
- **Electric blue `#16c2ff`** is its counterweight, used sparingly — chiefly the
  far pole of the wordmark and thinking-glyph gradients, so the brand reads as a
  charged field between the two rather than a single hue.

Threading one accent through plain surfaces does two jobs at once: it unifies the
look (every screen shares the same signal) and it keeps that signal meaningful
(nothing else competes for the eye). Add a second decorative color and you spend
the budget that makes the pink land — so the system doesn't.

**Light and dark are one system, not two skins.** Every color is a semantic token
(`surface`, `content`, `accent`, `border`…) that points at a value defined once
per mode. Components speak in roles — `bg-surface`, `text-content-muted` — never
raw hex. The accent is the tell: `#ff2e9a` is *the same* in both modes. What flips
is everything it sits on, so the signal is constant while the ground moves. Light
leans warm (a soft grey-green sidebar, `#ebf2eb`, keeps it off clinical white);
dark is honest near-black, not the fashionable navy-grey.

---

## Typography — a display voice and a reader's choice

Type carries the "two panes, two jobs" split directly:

- **Display — Space Grotesk.** The brand voice for UI. Headings, titles, stat
  numbers, the drop cap. A little geometric and odd, so branded copy reads as
  *Aether's*, not the system default.
- **Body — the reader's call.** The running text of an answer defaults to the
  system stack and can be switched to **Geist** (clean sans), **Georgia**, or
  **Lora** (for people who'd rather read long answers in a serif). Reading is one
  of the two jobs, so the reader gets a say in it.
- **Wordmark — Grenze Gotisch.** Chosen from a deliberate type-off
  (`design/wordmark-fonts.html`) for its **gothic caps** — the *Saltburn* register:
  modern-yet-retro-yet-modern-again, gothic letterforms that read contemporary
  rather than medieval. "Aether" is filled with the pink→blue diagonal (`#ff2e9a →
  #b54bd0 → #16c2ff`), so the gothic shapes carry the neon edge instead of tipping
  into period pastiche.

**A four-step scale, set by the whole root.** Text size is `xs 14 / sm 15 / md 16
/ lg 18`, applied to the root font-size so every rem-based size scales together —
one dial, proportional everywhere. It's a user setting, not a fixed choice,
because a phone and a 27″ monitor don't want the same measure.

And then the running text gets *typeset*, not just rendered — which is enough of
a feature to stand on its own. See *Editorial prose*, next.

---

## Editorial prose — the answer is a designed page

The single clearest expression of "two panes, two jobs": an assistant answer is
**set like an article, not dumped as chat text.** If the prose is half the
product, it should read like something a designer touched — so a small editorial
engine treats the Markdown the model already writes as typography.

**Automatic treatments** (no effort from the model — they just happen):

- A substantial answer earns a **standfirst** lead paragraph and a **drop cap**;
  a one-line reply stays plain. The treatment scales to the content, never
  imposed — no absurd drop cap on "Yes."
- `##` headings become section titles with a **lotus tick and a hairline rule**;
  `---` becomes a lotus divider; blockquotes become **accent-ruled pulls**; images
  become captioned figures; list bullets are lotuses.
- Body text keeps the reader's chosen font; only *display* elements (headings,
  drop cap, stat numbers, pull-quotes) switch to Space Grotesk. Colors are theme
  tokens, so light/dark track for free.

**An opt-in directive palette** the model art-directs with, sparingly — most
answers use none:

| Directive | Renders as |
|---|---|
| `:::lead` | a forced standfirst/lead block |
| `:::pullquote{cite="…"}` | a pulled phrase, large, in the display font |
| `:::callout{title="…"}` | a boxed key takeaway on an elevated surface |
| `:::aside` | a margin note that floats beside the column on wide layouts |
| `::stat[value]{label="…"}` | a big figure + caption |
| `:accent[…]` | inline emphasis in the brand accent |

The engine is **forgiving by design**: an unknown or malformed directive degrades
to plain text — a stray `:::` never leaks literal colons, and technical prose like
`namespace:function` keeps its text. Art direction that fails should quietly
become ordinary prose, never break the read.

The point isn't ornament. It's that a genuinely good answer deserves to *look*
like one, and the layer that makes that happen is design work, not string
formatting.

---

## The brand moments — where the character lives

Plain surfaces buy room for a few charged details. Three carry Aether's
personality:

- **The wordmark** — the gothic-caps "Aether" in the pink→blue gradient (see
  *Typography*). The loudest the identity gets.
- **The lotus, 𑁍 (U+1110D)** — a favorite glyph, put to work as the **default
  bullet.** In neon pink it also serves as the tick on section headings, the
  divider between them, and the character on the Send button. A small, consistent
  signature that costs nothing and shows up everywhere.
- **The thinking glyph** — the one overtly *pop-art* moment. While the agent
  works, the Aether "A" splits into **three offset copies — pink, purple, blue —
  that drift apart and reconverge** over a field of pulsing graph nodes: a
  Warhol-style registration of striking flat colors, a little punk and
  spray-painty. It reads as *thinking* — motion and convergence while the model
  crunches — and ties the glyph to the Knowledge Graph via the nodes. Reduced-
  motion users get the clean static "A" instead.

The wordmark and logo were arrived at through explicit exploration
(`design/logo-explorations.html`, `design/wordmark-fonts.html`), not defaulted
into.

---

## Motion — one language, spoken quietly

Motion in Aether is **functional and unified**, never ornamental. There's no
animation framework; every motion is a CSS keyframe from one shared vocabulary,
and staggered entrances all share a single convention (an `--i` index per element
driving a delay). The payoff: a table's rows, the tiles on the canvas, and the
starter prompts all animate with the *same* rhythm — the app feels like one hand
made it.

Where it shows up most is loading. The "composing the canvas" gathering animation
and the per-widget **skeletons** are there to convey *thinking and movement while
the model crunches* — and the skeletons animate in the shape of the widget that's
coming, so the canvas hints at an answer's structure before the data lands. The
felt wait shrinks because there's something alive to watch. (The thinking glyph,
above, is the same idea in miniature.)

**`prefers-reduced-motion` is respected on every keyframe** — the whole thing is a
garnish some users have asked to remove, and that's honored everywhere, not
selectively.

---

## Space and layout — restraint over ceremony

Spacing follows a consistent **4px rhythm** (the framework's grid), used directly
rather than wrapped in a bespoke spacing-token layer. This is a deliberate
*non*-decision: color, type, and theme genuinely need semantic tokens because they
carry meaning and flip between modes; spacing doesn't, and inventing a private
scale for it would be ceremony without payoff. Knowing which parts of a system
deserve tokens — and which are fine on a shared convention — is itself a design
judgment. Layout leans on real container queries (a nav that collapses to its
*own* width, not the viewport's) so structure responds to context, not just screen
size.

---

## Systems, made editable

The design system ships its own tooling, and that's a design position, not just an
engineering one:

- **The Style Guide is live, not a mockup.** Every token, type step, skeleton, and
  primitive on the `/style-guide` page is pulled from the running app. It can't
  drift from the source because it *is* the source. A design system you can only
  see in a slide deck is one nobody trusts.
- **Theme Lab makes the tokens playable.** `/theme-lab` turns every color token
  into a live control — edit the accent and the whole app re-themes instantly, per
  mode, saved to your browser. It exists for two reasons: so *anyone* can retheme
  Aether for themselves and see how the system is wired, and so the author can tune
  defaults by feel and export them straight to code. A design language you can put
  your hands on is one you actually understand.

The through-line: **the system is legible.** It explains itself, it lets you
inspect it, and — increasingly — it lets you change it.

---

## Principles (how the next decision gets made)

1. **A neutral field, one electric signal.** Energy comes from restraint plus a
   single loud accent, never from more color.
2. **Character in the accent, not the surface.** Surfaces get out of the way;
   personality lives in the accent and a few charged brand moments.
3. **Roles, not values.** Everything visual speaks in semantic tokens so light and
   dark are one system and the vocabulary stays small.
4. **The answer is a designed page.** Prose is half the product; set it, don't
   dump it.
5. **Loading should feel like thinking.** The waiting states convey activity and
   movement while the model crunches; motion stays one shared language and always
   yields to `prefers-reduced-motion`.
6. **Token what carries meaning; leave the rest on a convention.** Not everything
   deserves a scale.
7. **The manipulating user is king.** When someone drags, resizes, or retunes, the
   system bends to them — no template snaps their work back into place.
8. **Suggest, explain, let them override.** Smart defaults you can't change are the
   ones nobody trusts; the system proposes and stays legible about why.
9. **Make it inspectable.** A live Style Guide and an editable Theme Lab over a
   slide deck, every time.

---

## What it deliberately isn't

Stated so the boundaries read as choices, not gaps:

- **Not multi-theme** — light and dark, done well (OS-preference fallback,
  zero-flash boot). Theme Lab is where *personal* palettes live, not a shipped
  theme catalog.
- **Not a component library.** Accessible behavior comes from Radix primitives
  wrapped in token-styled shells — no shadcn/Chakra, no bespoke compound-component
  API. The system's value is the vocabulary and the shells, not a packaged catalog
  of parts.
- **Not a bespoke spacing scale.** By intent — see *Space and layout*.
