# @andystewartdesign/astro-marko

[Astro](https://astro.build) integration for [Marko 6](https://markojs.com) islands.

> **Alpha POC** — this is an early proof of concept. The API may change.

## Installation

```bash
npm install @andystewartdesign/astro-marko @marko/vite@^5 marko
```

> **Note:** `@marko/vite@6.x` requires Vite 8, which conflicts with Astro 6's bundled Vite 7. Pin to `@marko/vite@^5` until Astro upgrades to Vite 8.

## Setup

Add the integration to your `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import marko from "@andystewartdesign/astro-marko";

export default defineConfig({
  integrations: [marko()],
});
```

## Usage

### Server-rendered components

Any `.marko` file imported into an Astro page or layout will be rendered on the server:

```astro
---
import Hello from "./Hello.marko";
---

<Hello name="world" />
```

### Client islands

Add a `client:*` directive to hydrate a component in the browser:

```astro
---
import Counter from "./Counter.marko";
---

<Counter client:load initialCount={0} />
```

All of Astro's [client directives](https://docs.astro.build/en/reference/directives-reference/#client-directives) are supported: `client:load`, `client:idle`, `client:visible`, `client:media`, and `client:only`.

> **Note:** Astro islands use `mount()` to render fresh reactive DOM on the client rather than reconciling against server-rendered markup. True SSR hydration is a pending question for the Marko team.

### Slots

Slot content passed from Astro is available in the Marko template as HTML strings. The default slot maps to `input.content`; named slots keep their name.

```astro
<Card client:load>
  <span slot="header">Title</span>
  Body content here.
</Card>
```

```marko
// Card.marko
<div class="card">
  <div class="header" innerHTML=input.header/>
  <div class="body" innerHTML=input.content/>
</div>
```

## TypeScript

`.marko` imports are automatically typed as `Template` from the `marko` package. The integration injects an ambient `*.marko` module declaration into your project via Astro's type generation — no manual `tsconfig` changes needed.

> Full per-component `Input` type inference (typed props) is not yet supported.

## How it works

`@marko/vite` compiles `.marko` files for both SSR and browser targets. In an Astro project this involves a few tricky interactions:

**Virtual CSS modules** — `@marko/vite` generates virtual CSS imports in compiled `.marko` files. In Astro's dev SSR mode, Vite's CSS injection reads virtual URLs directly from disk, returning raw `.marko` source as CSS. This integration rewrites those imports to an `astro-marko-style:` scheme it owns, extracting only the `<style>` block content.

**Island entry resolution** — Astro wraps each island component in a virtual entry module. `@marko/vite` detects imports of `.marko` files from Rollup entry modules and adds a `?marko-browser-entry` query that switches to Marko's SPA hydration format. This breaks sub-tags imported from npm packages (they don't export `$template`). This integration intercepts those imports and returns resolved absolute paths so `@marko/vite` never adds the query.

**Environment API compatibility** — Astro 6 uses Vite's Environment API, where the prerender environment no longer sets `opts.ssr`. This integration shims the SSR flag based on `this.environment.name` so `@marko/vite` compiles templates in the correct mode.
