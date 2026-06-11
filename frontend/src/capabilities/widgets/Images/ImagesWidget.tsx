import { useAgentEvents } from "../../../shell/AgentEventContext";
import { useSessionContext } from "../../../shell/SessionContext";
import { useAgentBusy } from "../../../shell/useAgentBusy";
import type { Widget } from "../../registry";
import { WithContextMenu } from "../ContextMenu";
import { useFillFromConversation } from "../useFillFromConversation";
import { WidgetEmptyState } from "../WidgetEmptyState";
import { WidgetLoading } from "../WidgetLoading";
import type { ImageItem, ImagesSpec } from "./types";
import { useImagesState } from "./useImagesState";

export function ImagesWidget(_props: { widget: Widget }) {
  const { entries } = useImagesState();
  const busy = useAgentBusy();
  const { messages } = useSessionContext();
  const fill = useFillFromConversation({
    hasContent: entries.length > 0,
    gentlePrompt:
      "Looking back at what we've already discussed, search the web now for images relevant to it and show them here. This is about the conversation so far, not future messages — if there's genuinely nothing worth illustrating yet, just say so briefly.",
    forcedPrompt:
      "Call the render_images tool right now to find and display images related to our conversation so far.",
    displayText: "Update the Images from our conversation.",
  });

  if (entries.length === 0) {
    if (busy) return <WidgetLoading label="Searching for images…" />;
    return (
      <WidgetEmptyState
        invitation="Ask to see photos or pictures of something — I'll search the web and lay the results out here as a gallery."
        hasConversation={messages.length > 0}
        canUpdate={fill.canUpdate}
        onUpdate={fill.onUpdate}
        onReset={fill.reset}
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto bg-surface p-4">
      {entries.map(({ id, spec }) => (
        <SpecImages key={id} spec={spec} />
      ))}
    </div>
  );
}

// Source attribution. Unsplash's API terms require crediting the photographer
// AND linking Unsplash ("Photo by <name> on Unsplash"); we link the name to the
// photo page (img.href) and append the Unsplash link. Wikimedia just shows its
// creator credit.
function Attribution({ img }: { img: ImageItem }) {
  if (img.source === "unsplash") {
    return (
      <p className="mt-0.5 text-[0.65rem] text-content-subtle leading-snug">
        Photo by{" "}
        {img.href ? (
          <a
            href={img.href}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-content"
          >
            {img.credit ?? "Unknown"}
          </a>
        ) : (
          (img.credit ?? "Unknown")
        )}{" "}
        on{" "}
        <a
          href="https://unsplash.com"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-content"
        >
          Unsplash
        </a>
      </p>
    );
  }
  if (img.credit) {
    return (
      <p className="mt-0.5 text-[0.65rem] text-content-subtle leading-snug">
        {img.credit} · Wikimedia Commons
      </p>
    );
  }
  return null;
}

// Self-contained single-spec gallery (masonry, attribution, explore menu). Used by
// the Images tab and BigsailCard. Pure spec → JSX; canonical renderer.
export function SpecImages({ spec }: { spec: ImagesSpec }) {
  const bus = useAgentEvents();
  // Ground each image's explore prompt in the gallery title when present.
  const titleCtx = spec.title ? ` from the "${spec.title}" gallery` : "";
  return (
    <section className="flex flex-col gap-2">
      {spec.title && (
        <h2 className="font-display text-sm font-semibold text-content">
          {spec.title}
        </h2>
      )}
      {spec.blurb && (
        <p className="text-xs text-content-subtle leading-snug">{spec.blurb}</p>
      )}
      {/* CSS columns give true masonry flow with no extra dependency. Each tile
          must avoid breaking across a column boundary. */}
      <div className="columns-2 gap-2 lg:columns-3 *:mb-2 *:break-inside-avoid">
        {spec.images.map((img) => {
          // Best available subject text for this specific image.
          const subject =
            img.caption ?? img.alt ?? spec.blurb ?? spec.title ?? "this image";
          return (
            <WithContextMenu
              key={img.url}
              items={[
                {
                  label: "Explore further",
                  onClick: () =>
                    bus.emit({
                      type: "explore_request",
                      prompt: `Tell me more about this image${titleCtx}: "${subject}". Context behind it and what to explore next.`,
                    }),
                },
              ]}
            >
              <figure className="overflow-hidden">
                <a
                  href={img.href ?? img.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block"
                >
                  <img
                    src={img.url}
                    alt={img.alt ?? ""}
                    loading="lazy"
                    // Hide the whole tile when an image fails so a dead URL never
                    // leaves a gap in the grid.
                    onError={(e) => {
                      const fig = e.currentTarget.closest("figure");
                      if (fig) fig.style.display = "none";
                    }}
                    className="w-full rounded border border-border transition-opacity hover:opacity-90"
                  />
                </a>
                {img.caption && (
                  <figcaption className="mt-0.5 text-xs text-content-subtle leading-snug">
                    {img.caption}
                  </figcaption>
                )}
                <Attribution img={img} />
              </figure>
            </WithContextMenu>
          );
        })}
      </div>
    </section>
  );
}
