import type { ReactNode } from "react";
import { useAgentEvents } from "../../../shell/AgentEventContext";
import { useSessionContext } from "../../../shell/SessionContext";
import { useAgentBusy } from "../../../shell/useAgentBusy";
import type { Widget } from "../../registry";
import { WithContextMenu } from "../ContextMenu";
import { useAwaitingClarification } from "../useAwaitingClarification";
import { useEntryReload } from "../useEntryReload";
import { useFillFromConversation } from "../useFillFromConversation";
import { useQueuedExplore } from "../useQueuedExplore";
import { WidgetEmptyState } from "../WidgetEmptyState";
import { WidgetLoading } from "../WidgetLoading";
import {
  WidgetReloadAll,
  WidgetReloadHeaderButton,
} from "../WidgetReloadHeader";
import type { ImageItem, ImagesSpec } from "./types";
import { useImagesState } from "./useImagesState";

// Shared by the empty-panel fill and the populated-widget reload so they stay aligned.
const IMAGES_BUILD_PROMPT =
  "Build the best gallery you can about what we've been discussing. Search the web for real images of the subject — and broaden from what was literally said: illustrate the topic itself, its people, places, and objects, not only things named outright. This is about the conversation so far, not future messages. Don't ask whether to do it or offer to do it later — call search_images and then render_images now. Only skip if the subject genuinely can't be illustrated at all.";

export function ImagesWidget(_props: { widget: Widget }) {
  const { entries, requestReplace, requestReplaceEntry } = useImagesState();
  const busy = useAgentBusy();
  const { messages } = useSessionContext();
  const awaitingClarification = useAwaitingClarification();
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

  // Bottom "Reload" = DESTRUCTIVE rebuild of the whole view. Replace-on-arrival: the
  // current galleries stay until the new set lands, so an empty/failed rebuild can't
  // wipe the view.
  function onReloadAll() {
    action.enqueue({
      prompt: IMAGES_BUILD_PROMPT,
      displayText: "Rebuild the Images from our conversation.",
      onFire: requestReplace,
    });
  }

  // Per-entry header reload: rebuild just one gallery in place.
  const entryReload = useEntryReload("gallery", requestReplaceEntry);

  if (entries.length === 0) {
    if (busy) return <WidgetLoading label="Searching for images…" />;
    return (
      <WidgetEmptyState
        invitation="Ask to see photos or pictures of something — I'll search the web and lay the results out here as a gallery."
        hasConversation={messages.length > 0}
        canUpdate={fill.canUpdate}
        onUpdate={fill.onUpdate}
        onReset={fill.reset}
        awaitingClarification={awaitingClarification}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Row spacing lives on each gallery section (pt), not a container gap, so the
          per-entry sticky header can pull its solid bg up over it and cover the strip
          above when pinned — see SpecImages. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 pb-4">
        {entries.map(({ id, spec }, i) => (
          <SpecImages
            key={id}
            spec={spec}
            header={
              // Per-entry header: this gallery's title + a dim reload that rebuilds
              // just this one. "Get more" rides the FIRST gallery's header (append
              // more results); it queues mid-turn rather than disabling.
              <div className="flex items-center justify-between gap-2">
                <h2 className="truncate font-display text-sm font-semibold text-content">
                  {spec.title}
                </h2>
                <div className="flex shrink-0 items-center gap-2">
                  {i === 0 && (
                    <button
                      type="button"
                      onClick={getMore}
                      className="shrink-0 rounded border border-border px-3 py-1 text-xs text-content-subtle transition-colors hover:border-content-subtle hover:text-content"
                    >
                      {action.queued
                        ? "Queued…"
                        : busy
                          ? "Searching…"
                          : "Get more"}
                    </button>
                  )}
                  <WidgetReloadHeaderButton
                    onReload={() => entryReload.reloadEntry(id, spec.title)}
                    queued={entryReload.queued}
                    label="Reload just this gallery from the conversation"
                  />
                </div>
              </div>
            }
          />
        ))}
        {/* Quiet, always-present destructive rebuild of the whole view. */}
        <WidgetReloadAll onReload={onReloadAll} queued={action.queued} />
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
// the Images tab and BigsailCard. Pure spec → JSX; canonical renderer. `header`,
// when given (the Images tab), is a sticky per-entry header rendered in place of the
// plain title — it carries the title, a reload-this-one control, and the "Get more"
// button. Bigsail cards omit it and just get the plain title.
export function SpecImages({
  spec,
  header,
}: {
  spec: ImagesSpec;
  header?: ReactNode;
}) {
  const bus = useAgentEvents();
  // Ground each image's explore prompt in the gallery title when present.
  const titleCtx = spec.title ? ` from the "${spec.title}" gallery` : "";
  return (
    <section className={`flex flex-col gap-2 ${header ? "pt-4" : ""}`}>
      {header ? (
        // Sticky per-entry header (tab). -mt-4 pt-4 pulls its solid bg up over the
        // section's pt-4 so prior content scrolls cleanly UNDER it when pinned.
        <div className="-mx-4 -mt-4 sticky top-0 z-10 bg-surface px-4 pt-4 pb-2">
          {header}
        </div>
      ) : (
        spec.title && (
          <h2 className="font-display text-sm font-semibold text-content">
            {spec.title}
          </h2>
        )
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
