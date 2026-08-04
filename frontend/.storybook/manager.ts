import { addons } from "storybook/manager-api";
import { create } from "storybook/theming/create";

// Storybook's own chrome (the sidebar, toolbar, and the wordmark above it) is
// themed separately from the stories inside it — this file styles the *manager*,
// while preview.tsx styles the canvas.
//
// The reason this file exists is the brand link. Storybook's default top-left
// wordmark links to storybook.js.org, so anyone landing on these docs directly
// has no route back to the running app. The mark now reads "Aether design
// system" and points at the app itself.
//
// brandTarget is "_blank" on purpose: a visitor reading the docs shouldn't lose
// their place to go look at the app. Same-tab would make the wordmark a trapdoor.
addons.setConfig({
  theme: create({
    // The manager renders light regardless of the story theme — it's Storybook's
    // chrome, not Aether's surface, and the theme toolbar already switches the
    // canvas. Keeping the chrome fixed means the light/dark toggle demonstrates
    // the tokens rather than repainting the whole page.
    base: "light",
    brandTitle: "Aether design system",
    brandUrl: "https://aether.andrewbaldock.com",
    brandTarget: "_blank",
  }),
});
