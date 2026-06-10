import { useAgentEvents } from "../../../shell/AgentEventContext";
import type { Widget } from "../../registry";
import { WithContextMenu } from "../ContextMenu";
import type { ImageItem, ImagesSpec } from "./types";
import { useImagesState } from "./useImagesState";

export function ImagesWidget(_props: { widget: Widget }) {
  const { entries } = useImagesState();
  const bus = useAgentEvents();

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-8 text-center text-sm text-content-subtle">
        Ask to see photos or pictures of something — I'll search the web and lay
        the results out here as a gallery.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto bg-surface p-4">
      {entries.map(({ id, spec }) => {
        const label = spec.title ?? "Images";
        // Seed follow-up with the model's own blurb when it wrote one, so
        // "Explore further" has real subject matter rather than just a title.
        const explorePrompt = spec.blurb
          ? `Tell me more about this — "${spec.blurb}" — and what to explore next.`
          : `Tell me more about "${label}" — context behind these images and what to explore next.`;
        return (
          <WithContextMenu
            key={id}
            items={[
              {
                label: "Explore further",
                onClick: () =>
                  bus.emit({
                    type: "explore_request",
                    prompt: explorePrompt,
                  }),
              },
            ]}
          >
            <SpecImages spec={spec} />
          </WithContextMenu>
        );
      })}
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

function SpecImages({ spec }: { spec: ImagesSpec }) {
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
        {spec.images.map((img) => (
          <figure key={img.url} className="overflow-hidden">
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
        ))}
      </div>
    </section>
  );
}
