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

When a `.marko` component is imported into a non-Marko host file (e.g. an `.astro` frontmatter block), TypeScript has no way to infer the component's `Input` type. `astro-marko` currently ships an ambient `*.marko` module declaration that types all imports as `Template` (effectively `any` props).

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
