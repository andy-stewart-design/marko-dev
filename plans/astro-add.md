# `npx astro add` — How It Works

## Overview

`npx astro add` is not limited to official Astro integrations. Any npm package can be installed via it, as long as the package's `package.json` includes `"astro-integration"` (or `"astro-adapter"`) in its `keywords` array. That is the only gate.

To support `npx astro add @andystewartdesign/astro-marko`, add to `package.json`:

```json
{
  "keywords": ["astro-integration"]
}
```

## First-party vs. third-party

The CLI distinguishes between the two based purely on npm scope:

- Scoped to `@astrojs` → first-party
- Anything else → third-party

For third-party packages, the CLI warns the user ("this is not an official Astro package") and prompts them to confirm before proceeding. After confirmation, the flow is identical — it installs the package, installs peer dependencies, and adds the integration to `astro.config.mjs`.

## What `astro add` does for any integration

Regardless of first- or third-party status:

1. Fetches the package from npm to validate it exists and read its metadata
2. Installs the package and any non-optional, non-astro peer dependencies
3. Adds the integration to `astro.config.mjs` (import + adds to `integrations` array)

## What `astro add` does only for hardcoded packages

The extra setup steps — creating config files, scaffolding directories, modifying `.gitignore` — are hardcoded in the `astro add` source, keyed by integration ID. Examples:

- `svelte` → creates `svelte.config.js`
- `db` → scaffolds `./db/config.ts` and `./db/seed.ts`
- `lit` → creates `.npmrc` for pnpm workspaces
- `vercel` → adds `.vercel` to `.gitignore`
- `tailwind` → creates a global CSS file

There is no API for third-party integrations to hook into this behavior. The only way to get custom setup steps into `astro add` is to have them hardcoded in the Astro CLI source — which requires a PR to the Astro repo.

## Implications for `astro-marko`

`npx astro add @andystewartdesign/astro-marko` would get users most of the way there:

- Package installed ✓
- Peer deps (`@marko/vite`, `marko`) installed ✓
- `marko()` added to `astro.config.mjs` ✓
- Custom setup (tsconfig, gitignore) ✗ — not possible via `astro add`

This is fine because `astro-marko` already handles its own setup at runtime — `ensureAllowArbitraryExtensions` and `ensureGitignore` run on the first dev server start. So `astro add` handles discovery and installation, and the integration handles the rest.

The one gap: users would need to manually add `{ dts: true }` to the `marko()` call in their config, since `astro add` has no way to know about integration-specific options.
