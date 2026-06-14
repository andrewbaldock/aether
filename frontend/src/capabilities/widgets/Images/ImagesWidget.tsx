import type { ReactNode } from "react";
import { useAgentEvents } from "../../../shell/AgentEventContext";
import { useSessionContext } from "../../../shell/SessionContext";
import { useAgentBusy } from "../../../shell/useAgentBusy";
import type { Widget } from "../../registry";
import { WithContextMenu } from "../ContextMenu";
import { useFillFromConversation } from "../useFillFromConversation";
import { useQueuedExplore } from "../useQueuedExplore";
import { WidgetEmptyState } from "../WidgetEmptyState";
import { WidgetLoading } from "../WidgetLoading";
import { WidgetReloadHeader } from "../WidgetReloadHeader";
import type { ImageItem, ImagesSpec } from "./types";
import { useImagesState } from "./useImagesState";

// Shared by the empty-panel fill and the populated-widget reload so they stay aligned.
const IMAGES_BUILD_PROMPT =
  "Build the best gallery you can about what we've been discussing. Search the web for real images of the subject — and broaden from what was literally said: illustrate the topic itself, its people, places, and objects, not only things named outright. This is about the conversation so far, not future messages. Don't ask whether to do it or offer to do it later — call search_images and then render_images now. Only skip if the subject genuinely can't be illustrated at all.";

export function ImagesWidget(_props: { widget: Widget }) {
  const { entries, clearEntries } = useImagesState();
  const busy = useAgentBusy();
  const { messages } = useSessionContext();
  const fill = useFillFromConversation({
    hasContent: entries.length > 0,
    gentlePrompt: IMAGES_BUILD_PROMPT,
    forcedPrompt:
      "Call the render_images tool right now to find and display images related to our conversation so far.",
    displayText: "Update the Images from our conversation.",
  });

  // Both "Get more" (append) and reload (replace) queue through one hook so a click
  // mid-turn fires when the turn settles (latest-wins) instead of being dropped.
  const action = useQueuedExplore();

  // Broaden the image search around what's already shown and APPEND the results.
  // Reuses the explore_request → sendMessage → render_images → append pipeline; the
  // backend search_images has no offset, so this asks for a wider/related batch (not
  // exact pagination), which matches the append-only design. Grounds the prompt in
  // the most recent gallery's title/blurb so the broaden stays on-topic.
  function getMore() {
    const recent = entries[entries.length - 1]?.spec;
    const subject = recent?.title ?? recent?.blurb ?? "what's already shown";
    action.enqueue({
      prompt:
        `Broaden the image search around "${subject}" and call render_images to show MORE ` +
        `images than what's already displayed — different facets, related subjects, alternate ` +
        `angles, wider context. Don't repeat images already shown; add a fresh gallery of additional results.`,
      displayText: "Get more images.",
    });
  }

  // Reload = clear the galleries and rebuild fresh from the conversation.
  function onReload() {
    action.enqueue({
      prompt: IMAGES_BUILD_PROMPT,
      displayText: "Rebuild the Images from our conversation.",
      onFire: clearEntries,
    });
  }

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
    <div className="flex h-full flex-col bg-surface">
      <WidgetReloadHeader
        onReload={onReload}
        queued={action.queued}
        label="Rebuild the gallery from the conversation"
      />
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-4">
        {entries.map(({ id, spec }, i) => (
          // "Get more" rides the first gallery's title row, top-right, so there's a
          // single header line. Subsequent galleries render plain. It queues rather
          // than disabling mid-turn, so it stays clickable while a turn is in flight.
          <SpecImages
            key={id}
            spec={spec}
            action={
              i === 0 ? (
                <button
                  type="button"
                  onClick={getMore}
                  className="shrink-0 rounded border border-border px-3 py-1 text-xs text-content-subtle transition-colors hover:border-content-subtle hover:text-content"
                >
                  {action.queued ? "Queued…" : busy ? "Searching…" : "Get more"}
                </button>
              ) : undefined
            }
          />
        ))}
      </div>
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
// the Images tab and BigsailCard. Pure spec → JSX; canonical renderer. `action` is
// an optional control (e.g. the Images tab's "Get more" button) rendered on the
// title row, right-aligned; omitted by BigsailCard.
export function SpecImages({
  spec,
  action,
}: {
  spec: ImagesSpec;
  action?: ReactNode;
}) {
  const bus = useAgentEvents();
  // Ground each image's explore prompt in the gallery title when present.
  const titleCtx = spec.title ? ` from the "${spec.title}" gallery` : "";
  return (
    <section className="flex flex-col gap-2">
      {(spec.title || action) && (
        <div className="flex items-start justify-between gap-2">
          {spec.title ? (
            <h2 className="font-display text-sm font-semibold text-content">
              {spec.title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
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
              label="Explore this image"
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
