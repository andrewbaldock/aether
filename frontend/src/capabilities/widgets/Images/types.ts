// The render_images spec — what the backend echoes back over the tool_result SSE
// seam. Mirrors the backend tool's input_schema in tools.ts. The image URLs come
// from the server-side search_images tool (Openverse), so they're real, not
// model-invented.

export interface ImageItem {
  url: string;
  alt?: string;
  caption?: string;
  href?: string;
  credit?: string;
  source?: "wikimedia" | "unsplash";
}

export interface ImagesSpec {
  title?: string;
  blurb?: string;
  images: ImageItem[];
}
