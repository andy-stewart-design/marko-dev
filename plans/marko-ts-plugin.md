# Marko TypeScript Language Service Plugin

## Problem

The current `astro-marko` integration provides loose typing for `.marko` imports via a wildcard ambient declaration (`declare module "*.marko"`). The `dts` opt-in (shipped in `0.1.6-beta`) improves this by generating `.marko.d.ts` sidecar files at build time, but it requires `allowArbitraryExtensions`, writes files to disk, and needs a one-time editor restart. It is a workaround, not a proper solution.

The root issue: TypeScript has no built-in understanding of `.marko` files. Svelte solves an identical problem via `svelte2tsx` — a TypeScript language service plugin that produces virtual TypeScript from `.svelte` source on demand, entirely in memory, with no files written to disk and no special compiler flags. Marko needs the same thing.

---

## Goals

- `.marko` imports in `.astro`, `.ts`, and `.tsx` files resolve to their specific `Input` type, with full autocomplete and prop validation
- No sidecar files, no `allowArbitraryExtensions`, no gitignore entries
- Works in VS Code without manual configuration beyond installing an extension
- Does not require changes to the Astro or Marko core packages to function as a POC

---

## Background

### How `svelte2tsx` works

The Svelte VS Code extension registers a **Volar language plugin** with the language server. When the language server encounters a `.svelte` import, the plugin intercepts it and returns a virtual TypeScript representation of the file produced by `svelte2tsx`. The language server treats `.svelte` files as if they were `.ts` files — no disk writes, no special compiler flags.

The Astro language server (`@astrojs/language-server`) has built-in awareness of Svelte and loads its Volar plugin automatically when detected.

### What `@marko/language-tools` provides

`@marko/language-tools` already implements a processor interface that can transform `.marko` source into virtual TypeScript:

- `Processors.create({ ts, host, configFile })` — initialises a processor with access to the TypeScript compiler API
- `processor.extract(fileName, code)` — parses a `.marko` file into an `Extracted` representation
- `processor.print({ extracted, printer, sourceFile, typeChecker, formatSettings })` — produces the full virtual TypeScript output, including the `Input` interface and component type

This is the same tooling used by the Marko VS Code extension for type checking inside `.marko` files. The gap is that nobody has wired it up for `.marko` imports consumed from outside — i.e. from `.astro` or `.ts` files.

### TypeScript language service plugins

A TypeScript language service plugin is a Node module that `tsserver` loads at startup based on a `plugins` entry in `tsconfig.json`. It receives a `PluginCreateInfo` object containing the full `ts.LanguageService`, `ts.LanguageServiceHost`, and project context. This gives it everything needed to call `@marko/language-tools`' `print()` correctly, including a real `TypeChecker` — something unavailable in a Vite plugin context.

**Important limitation:** TS language service plugins affect editor tooling only (`tsserver`). They do not run during `tsc` command-line type checking. For Astro projects this is acceptable — Astro handles its own build pipeline and users rarely run `tsc` directly.

---

## POC Path

A local, self-contained proof of concept to validate the approach before engaging the Marko and Astro teams.

### Deliverables

#### 1. `packages/marko-ts-plugin`

A TypeScript language service plugin that intercepts `.marko` module resolution inside `tsserver`.

**Core responsibilities:**
- Proxy `ts.LanguageService` to intercept calls relevant to `.marko` files
- On module resolution for a `.marko` import, use `@marko/language-tools` to produce virtual TypeScript
- Surface the `Input` interface as the module's type so consumers see typed props

**Key implementation sketch:**

```ts
import type ts from 'typescript/lib/tsserverlibrary';
import * as Processors from '@marko/language-tools/processors';

function init(modules: { typescript: typeof ts }) {
  function create(info: ts.server.PluginCreateInfo) {
    const ts = modules.typescript;

    const processor = Processors.create({
      ts,
      host: info.languageServiceHost,
      configFile: info.project.getProjectName(),
    })['.marko'];

    const proxy: ts.LanguageService = Object.create(info.languageService);

    // Intercept completions, definitions, diagnostics etc. for .marko files
    // by transforming source through the processor and redirecting requests
    // into the virtual TypeScript output.

    return proxy;
  }

  return { create };
}

export = init;
```

**Open questions for POC:**
- How reliably does `processor.print()` work in a plugin context with a real `TypeChecker`? This is the core technical bet.
- Does the Astro language server pass plugin calls through `tsserver` cleanly, or is a plain `.ts` test file needed to isolate variables first?

#### 2. `packages/marko-vscode` (VS Code extension)

A minimal VS Code extension with two jobs:
- Register `.marko` as a known language so VS Code doesn't treat files as plaintext
- Tell VS Code to activate `marko-ts-plugin` for workspaces containing `.marko` files

The extension itself is ~50 lines. It does not need to ship a language server of its own for the POC — it just ensures `tsserver` loads the plugin.

**`package.json` (extension manifest, abbreviated):**
```json
{
  "contributes": {
    "languages": [{
      "id": "marko",
      "extensions": [".marko"]
    }],
    "typescriptServerPlugins": [{
      "name": "marko-ts-plugin",
      "enableForWorkspaceTypeScriptVersions": true
    }]
  }
}
```

#### 3. Test project config

In `apps/astro-test/tsconfig.json`, add the plugin entry:

```json
{
  "compilerOptions": {
    "plugins": [{ "name": "marko-ts-plugin" }]
  }
}
```

No `allowArbitraryExtensions`. No sidecar files.

### POC success criteria

- Import a `.marko` component in an `.astro` file
- Hover shows `Template<Input>` with the component's actual props
- Missing required props produce a type error
- Unknown props produce a type error
- No `.marko.d.ts` files on disk

### POC install

```bash
code --install-extension ./marko-vscode-0.0.1.vsix
```

---

## Real Path

The production implementation, intended to be proposed to the Marko and Astro teams after the POC validates the approach.

### Deliverables

#### 1. `@marko/volar-plugin`

A proper **Volar language plugin** (implementing `LanguagePlugin` from `@volar/language-core`) rather than a raw TS service plugin proxy. Volar plugins are the correct abstraction for the Astro language server and give full control over virtual code generation, diagnostics, completions, hover, go-to-definition, and rename across the entire component boundary.

This would live in the `@marko/language-tools` repository and be maintained by the Marko team.

#### 2. `@astrojs/language-server` integration

A PR to the Astro language server to register the Marko Volar plugin alongside the existing React, Vue, and Svelte plugins. The server already has a detection pattern for these frameworks — Marko would follow the same shape.

This gives zero-config typed imports for any Astro project using `astro-marko`, with no `tsconfig.json` changes required.

#### 3. `astro-marko` integration update

- Remove the `dts` option (or keep it as a legacy fallback for non-VS Code editors)
- The integration's job becomes purely runtime: renderer registration, Vite plugin, CSS handling
- TypeScript support is handled entirely by the language tooling layer

#### 4. Official Marko VS Code extension update

The existing Marko VS Code extension (maintained by the Marko team) would ship the Volar plugin, replacing or augmenting its current language server. This is the distribution mechanism — users install the extension, the rest is automatic.

### Real path success criteria

- Works in any editor with Volar/TypeScript support, not just VS Code
- Zero user configuration — no `tsconfig.json` changes, no extension installs beyond the Marko extension
- `tsc` command-line type checking works (Volar plugins can participate in build-time checking, unlike raw TS service plugins)
- Go-to-definition, rename, and find-references work across `.astro` → `.marko` boundaries

---

## Relationship between POC and Real Path

The POC proves the core technical bet: that `@marko/language-tools` can be driven from outside a `.marko` file to produce accurate type information for consumers. If it works, the Real Path is a matter of wrapping that in the correct abstraction layer (Volar plugin instead of TS service plugin proxy) and getting it into the right packages.

The `dts` sidecar approach currently shipping in `0.1.6-beta` remains a useful fallback for users who can't or don't want to install the VS Code extension, and for `tsc` command-line scenarios.

---

## Suggested sequencing

1. Build and validate the POC locally against `apps/astro-test`
2. Write up findings — what worked, what didn't, what the `print()` output looks like in practice
3. Open an issue in `marko-js/language-tools` with the proposal and POC findings
4. Open an issue in `withastro/language-tools` with the same
5. Build `@marko/volar-plugin` in collaboration with the Marko team
6. PR to `@astrojs/language-server`
7. Deprecate `dts` option in `astro-marko` once the language tooling path is stable
