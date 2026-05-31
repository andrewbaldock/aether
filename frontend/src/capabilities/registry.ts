import type { ComponentType } from "react";

// A widget is one entry in the capability column. The shell knows only this shape —
// never what's inside. The matching renderer (keyed by `type`) reads `state`.
export interface Widget {
  id: string;
  type: string;
  title: string;
  state: unknown;
}

// A renderer is a plugin: it claims a `type` and knows how to draw that widget's state.
// New experiences plug in by registering one — nothing in the shell changes.
export type WidgetRenderer = ComponentType<{ widget: Widget }>;

const renderers = new Map<string, WidgetRenderer>();

export function registerRenderer(type: string, renderer: WidgetRenderer): void {
  renderers.set(type, renderer);
}

export function getRenderer(type: string): WidgetRenderer | undefined {
  return renderers.get(type);
}
