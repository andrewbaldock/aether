import type { StorybookConfig } from "@storybook/react-vite";

// Storybook reuses the app's own vite.config.ts (React plugin, Tailwind v4
// plugin, the @contract alias) — so a story renders through exactly the same
// pipeline as the app, and the @theme tokens are live rather than re-declared.
// The one thing we switch off there is vite-plugin-pwa (see STORYBOOK gate in
// vite.config.ts): a docs site has no business shipping the app's service worker.
const config: StorybookConfig = {
  stories: ["./docs/*.mdx", "../src/**/*.stories.tsx"],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
  ],
  framework: { name: "@storybook/react-vite", options: {} },
  typescript: {
    // react-docgen-typescript reads the real TS types (incl. the JSDoc on
    // TooltipProps etc.), which is what makes the autodocs prop tables useful.
    // Slower than the default react-docgen; worth it for a docs site.
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      // Without this the tables drown in inherited DOM/React props.
      propFilter: (prop) => !prop.parent?.fileName.includes("node_modules"),
    },
  },
};

export default config;
