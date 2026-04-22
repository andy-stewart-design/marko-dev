// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import marko from "@andystewartdesign/astro-marko";

// https://astro.build/config
export default defineConfig({
  integrations: [marko({ dts: true }), mdx()],
  markdown: {
    shikiConfig: {
      theme: "catppuccin-mocha",
    },
  },
});
