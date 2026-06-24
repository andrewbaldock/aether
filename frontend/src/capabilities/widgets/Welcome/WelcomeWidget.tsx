import { Code, Network, Wrench } from "lucide-react";
import { CASE_STUDY_URL, REPO_URL, SITE_URL } from "../../../lib/links";
import { AdminPage } from "../../../shell/AdminPage";
import type { Widget } from "../../registry";
import { AgentDiagramWidget } from "../AgentDiagram/AgentDiagramWidget";

// "Welcome to Aether" — the first-arrival explainer. It frames the live agent
// diagram (the same viz the eyeball reveals) with a short pitch and callouts for
// the two seams that make Aether extensible: the LLM/provider behind the agent,
// and the tools the agent can reach for. The diagram itself is the real runtime
// component, so this dogfoods the platform rather than drawing a static picture.
export function WelcomeWidget(_props: { widget: Widget }) {
  return (
    <AdminPage title="Welcome to Aether">
      <p className="mt-2 text-sm leading-relaxed text-content-muted">
        Aether is a conversational explorer: you chat with an AI agent, and it
        reaches for <span className="text-content">tools</span> to show its work
        beside you — mapping a live{" "}
        <span className="text-content">knowledge graph</span>, and soon charts,
        tables, and more. Below is the agent loop itself, live. Ask a question
        and watch it light up.{" "}
        <a
          href={CASE_STUDY_URL}
          target="_blank"
          rel="noreferrer"
          className="text-neon-cyan hover:underline"
        >
          Read the case study →
        </a>
      </p>

      {/* The two seams that make Aether a platform, not a single app. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <PlugPoint
          icon={<Network className="h-4 w-4" aria-hidden />}
          title="LLM / Provider"
          body="The brain behind the agent is swappable. Pick a model per
            conversation today; more providers plug into the same seam."
        />
        <PlugPoint
          icon={<Wrench className="h-4 w-4" aria-hidden />}
          title="Tools"
          body="Each capability is a tool the agent can call. The knowledge
            graph is the first; charts, tables, and more are next."
        />
      </div>

      {/* The live agent diagram, framed as the centerpiece. */}
      <div className="mt-6 overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-surface-raised px-3 py-2 text-xs font-medium uppercase tracking-wide text-content">
          The agent loop
        </div>
        {/* Match the diagram's viewBox (≈900×576, three columns) so it fills the
              frame instead of letterboxing in vertical whitespace. No legend here
              — the explainer copy already frames it. */}
        <div className="aspect-[900/576] w-full">
          <AgentDiagramWidget
            widget={_props.widget}
            showLegend={false}
            showConsole={false}
          />
        </div>
      </div>

      <p className="mt-4 text-xs text-content-subtle">
        You can reopen this anytime from the help (?) icon.
      </p>

      {/* Byline + links back to the maker's portfolio, case study, and source. */}
      <footer className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-content-faint">
        <span>
          Built by{" "}
          <a
            href={SITE_URL}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-content-muted"
          >
            Andrew Baldock
          </a>{" "}
          · 2026
        </span>
        <span aria-hidden className="text-content-faint">
          ·
        </span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 transition-colors hover:text-content-muted"
        >
          <Code className="h-3 w-3" aria-hidden />
          GitHub
        </a>
      </footer>
    </AdminPage>
  );
}

function PlugPoint({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-3">
      <div className="flex items-center gap-2 text-content">
        <span className="text-neon-pink">{icon}</span>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-content-muted">
        {body}
      </p>
    </div>
  );
}
