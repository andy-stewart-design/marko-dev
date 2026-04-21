# Dev Notes

Development notes, constraints, and open questions for `astro-marko`.

---

## `@marko/vite` version constraint: Vite 7 vs. Vite 8

**Constraint:** `astro-marko` pins `@marko/vite@^5.4.9`. Upgrading to `@marko/vite@6.x` breaks installs in any Astro 6 project.

**Why:** `@marko/vite@6.x` declares `vite@^8` as a peer dependency. Astro 6 ships Vite 7. These two cannot coexist — npm will refuse to install them together (`ERESOLVE`) unless `--legacy-peer-deps` is used, in which case Astro emits a Vite version mismatch warning at runtime.

**Verified peer deps (as of 2026-04-21):**

| Package             | `vite` peer dep | `@marko/compiler` peer dep |
| ------------------- | --------------- | -------------------------- |
| `@marko/vite@5.4.9` | `4 - 8`         | `^5`                       |
| `@marko/vite@6.0.5` | `^8`            | `^5`                       |

Both versions target the same Marko compiler version (`@marko/compiler@^5`). There is **no** version inversion between `@marko/vite` and Marko — the only difference between the two `@marko/vite` majors is the Vite requirement.

**Resolution:** Stay on `@marko/vite@^5.x` until Astro upgrades its bundled Vite to v8. At that point, upgrading `astro-marko`'s peer dep to `@marko/vite@^6` should be straightforward — the Marko compiler constraint is identical and `@marko/vite@6.x` supports Marko 6 / Tags API.

---

## TypeScript `Input` type inference for external consumers

When a `.marko` component is imported into a non-Marko host file (e.g. an `.astro` frontmatter block), TypeScript has no way to infer the component's `Input` type. `astro-marko` does not currently ship an ambient `*.marko` module declaration, so `.marko` imports are untyped (`any`) in host files.

**TODO:** Add an ambient `*.marko` module declaration via Astro's `injectTypes` hook in `astro:config:setup`. This would give users typed imports automatically without requiring manual `tsconfig` changes. The declaration would type the default export as `Template` — not full `Input` inference, but better than `any`. Full `Input` inference per component is the deeper open question below.

For Vue, Astro's language server delegates to Volar for typed prop inference. The equivalent for Marko is an open question.

**Questions for the Marko team:**

- Does `@marko/language-tools` expose any hook or API for external language servers (e.g. Astro's Volar-based LS) to query component `Input` types?
- Does `@marko/type-check` generate `.d.marko` sidecar files? Could `.d.ts` sidecars exposing `Input` be emitted so standard TS sees them?
- Is there a TypeScript language service plugin (à la `@vue/typescript-plugin`) in the roadmap, or is `@marko/type-check`-as-CLI the intended model?

**Goal:** Full typed `Input` inference when importing `.marko` files into `.astro` (and eventually `.ts`) files — the same experience Vue and Svelte users have today.

---

## Island hydration: `mount()` re-renders rather than reconciles

`client:*` islands are working via `Template.mount(input, element)`. However, the current implementation is not true SSR hydration — `client.ts` clears `element.innerHTML` before calling `mount()`, so Marko builds a fresh reactive DOM rather than reconciling against the server-rendered markup. This means the server-rendered content is discarded and rebuilt on the client, which can produce a flash on slow connections.

**Questions for the Marko team:**

- Does `Template.mount()` support hydrating against existing server-rendered markup, or does it always do a full client render?
- Does `Template.render()` include hydration markers when the output is intended for later client hydration, or does that require a separate render path?
- Is there a recommended API for SSR-with-hydration vs. SSR-static in Marko 6?

**Goal:** True SSR + hydration handoff — client picks up where the server left off without a teardown/remount cycle.

---

## `@marko/vite` SSR detection doesn't understand Astro's `"prerender"` environment

`@marko/vite@5.x` detects SSR mode via the third argument to its `transform` hook (`opts.ssr`). In Vite 7's Environment API (used by Astro 6), the prerender pipeline no longer sets `opts.ssr` — SSR context is conveyed via `this.environment.name` instead. Astro's prerender environment is named `"prerender"`, not `"ssr"`.

Without intervention, `@marko/vite@5.x` would compile `.marko` files in DOM (browser) mode during prerender builds, producing `document.` calls that crash with `document is not defined`.

**Workaround:** `guardedMarkoVite` in `index.ts` wraps each `@marko/vite` plugin that has a `transform` hook. When `this.environment.name` is defined and not `"client"`, it injects `ssr: true` into `opts` before delegating to the original transform, restoring correct SSR compilation.

Note: `@marko/vite@6.x` handles this differently — it checks `this.environment.name === "ssr"` directly and ignores `opts.ssr` entirely. This means the `guardedMarkoVite` shim would not fix `@marko/vite@6.x`, which would also fail against Astro's `"prerender"` environment name. Upgrading to `@marko/vite@6.x` (when Astro moves to Vite 8) will require revisiting this.

**Question for the Marko team:** Is there a `@marko/vite` config option to specify which environment names should be treated as SSR (e.g. `ssrEnvironments: ['ssr', 'prerender']`)? Or a plugin hook to declare "this environment is SSR" at `configEnvironment` time regardless of its name?

---

## `@marko/vite` doesn't respect the `\x00` virtual module prefix

By Vite convention, module IDs prefixed with `\x00` are already-resolved virtual modules and should not be processed as real files. `@marko/vite` does not check for this prefix in its `transform` hook. When Astro creates virtual entry IDs like `\x00astro-entry:/path/Hello.marko`, `@marko/vite` sees the `.marko` suffix, attempts to compile the virtual ID as a real file path, calls `readdirSync` on a nonsensical path, and crashes.

**Workaround:** `guardedMarkoVite` returns `null` immediately from `transform` if `id.startsWith('\x00')`.

**Question for the Marko team:** Would a PR adding an early-return guard for `\x00`-prefixed IDs to `@marko/vite`'s `transform` hook be welcome? If fixed upstream, the `guardedMarkoVite` wrapper could eventually be removed.

---

## `@marko/vite` redirects `.marko` imports from Rollup entry modules to `?marko-browser-entry`

When `@marko/vite` detects a `.marko` import from a Rollup entry module, it redirects the import to `?marko-browser-entry` — Marko's own SPA hydration format, compiled with `hydrateConfig`. This format lacks a `default` export, so Astro's island bundler (which expects a `default` export from `domConfig` compilation) fails.

In Astro 6, `.marko` component files can themselves be the direct Rollup entry. When `hello.marko` (an entry) imports `child.marko`, `@marko/vite` sees an entry-module → `.marko` import and adds `?marko-browser-entry` to the child too, breaking sub-component imports.

**Workaround:** `markoIslandResolverPlugin` in `index.ts` runs with `enforce: 'pre'` and claims `.marko` IDs before `@marko/vite` can touch them, returning the resolved absolute path directly. This bypasses `@marko/vite`'s entry-module detection entirely.

**Question for the Marko team:** Is there an option on the `@marko/vite` plugin to disable `?marko-browser-entry` redirection for specific importers or entry points? Should third-party integrations be implementing their own `resolveId` hook to intercept before `@marko/vite`, or is there an intended extension point for this use case?
