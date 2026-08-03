import * as RadixTooltip from "@radix-ui/react-tooltip";
import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react-vite";
// The app's real stylesheet — @theme tokens, the .dark block, and the shared
// keyframes (skeleton shimmer, card flip) all come from here. Nothing about the
// design system is re-declared for Storybook.
import "../src/index.css";

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    docs: { toc: true },
    // The `.dark` toggle owns the canvas background via bg-surface; the
    // backgrounds addon would fight it with a hardcoded white/black.
    backgrounds: { disable: true },
    options: {
      // Explicit, because the default is file-discovery order — which put
      // ExploreMenu above Button and buried AdminPage at the bottom. A design
      // system's sidebar IS its table of contents: read top to bottom it should
      // go principles → tokens → primitives → composed shells.
      storySort: {
        order: [
          "Foundations",
          [
            "Introduction",
            "Design Tokens",
            "Typeset engine",
            "Loading states",
            "Empty states",
          ],
          "Shell",
          [
            "Button",
            "Input",
            "IconButton",
            "Tooltip",
            "ConfirmDialog",
            "ExploreMenu",
            "ModelPicker",
            "StarterPrompts",
            "AdminPage",
          ],
          "Widgets",
          ["CardShell", "SkeletonCard", "Chart palette"],
        ],
      },
    },
  },
  decorators: [
    // Every story renders inside the token surface, in the app's own font
    // stack. Radix tooltips need a Provider ancestor (App.tsx supplies one at
    // the app root) — same delays here so hover timing matches production.
    (Story) => (
      <RadixTooltip.Provider delayDuration={300} skipDelayDuration={150}>
        <div className="bg-surface p-6 text-content">
          <Story />
        </div>
      </RadixTooltip.Provider>
    ),
    // Toolbar theme switch. Flips the same `.dark` class on <html> that
    // useTheme flips in the app — no component anywhere is theme-aware, so
    // swapping the class is the entire mechanism.
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
    }),
  ],
};

export default preview;
