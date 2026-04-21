import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { AstroIntegration } from 'astro';
import markoVite from '@marko/vite';

// Vite 6+ Environment API — not yet in Rollup's PluginContext types.
type EnvironmentPluginContext = { environment?: { name: string } };

// Rollup transform hook options — ssr flag used by @marko/vite to detect SSR mode.
type TransformOptions = { ssr?: boolean };

const STYLE_PREFIX = 'astro-marko-style:';
const VIRTUAL_CSS_RE = /["']([^"']*\?marko-virtual[^"']*\.css)["']/g;

/**
 * @marko/vite generates virtual CSS module imports in compiled .marko files:
 *   import "./Hello.marko?marko-virtual&id=Hello.marko.css"
 *
 * In Astro's dev SSR mode, Vite's CSS injection reads the file at the virtual
 * URL directly (bypassing the plugin module graph), which returns the raw
 * .marko source as "CSS". This corrupts the page HTML.
 *
 * This plugin has two parts:
 * 1. transform — rewrites virtual CSS imports to our own `astro-marko-style:`
 *    URL scheme immediately after @marko/vite compiles each .marko file.
 * 2. resolveId/load — handles `astro-marko-style:` URLs by extracting only
 *    the CSS from the <style> blocks in the .marko source.
 */
/**
 * Prevents @marko/vite from redirecting .marko imports from Astro's island
 * entry points to `?marko-browser-entry` (Marko's own SPA hydration format,
 * compiled with hydrateConfig, which lacks a `default` export).
 *
 * @marko/vite detects "import of .marko from a Rollup entry module" and adds
 * ?marko-browser-entry. Astro's astro-entry: virtual modules are Rollup entries.
 * By claiming the resolveId first we return the plain absolute path, so
 * @marko/vite's transform falls through to domConfig — the regular browser
 * compilation that exports the template as `default`.
 */
function markoIslandResolverPlugin() {
  return {
    name: 'astro-marko:island-resolver',
    enforce: 'pre' as const,
    resolveId(id: string, importer: string | undefined, options: { ssr?: boolean }) {
      if (!options?.ssr && id.endsWith('.marko') && importer != null) {
        // Astro 5: importer is \x00astro-entry:/real/path.marko (virtual entry module)
        if (importer.includes('astro-entry:') || importer.startsWith('\x00astro-entry:')) {
          if (path.isAbsolute(id)) return id;
          const realImporter = importer.replace(/^\x00/, '').replace(/^astro-entry:/, '');
          return path.resolve(path.dirname(realImporter), id);
        }
        // Astro 6: component files are direct Rollup entries. When hello.marko (an
        // entry) imports child.marko, @marko/vite sees an entry-module import and
        // adds ?marko-browser-entry. Intercept here to return the plain path instead.
        if (importer.endsWith('.marko')) {
          if (path.isAbsolute(id)) return id;
          if (id.startsWith('.')) return path.resolve(path.dirname(importer), id);
          // Package-path .marko import (e.g. from an npm tag library).
          // Resolve to an absolute path here so @marko/vite never sees this in
          // its resolveId hook — if it did, it would add ?marko-browser-entry
          // (because the importer is a Rollup entry), which breaks sub-tags from
          // npm packages. Returning the absolute path bypasses that logic, which
          // is the same outcome workspace symlinks get automatically.
          try {
            return createRequire(importer).resolve(id);
          } catch {
            return null;
          }
        }
      }
    },
  };
}

/**
 * Part 1 (pre): claims `astro-marko-style:` virtual module IDs so @marko/vite
 * doesn't try to compile them as .marko templates.
 */
function markoStyleResolverPlugin() {
  return {
    name: 'astro-marko:styles-resolver',
    enforce: 'pre' as const,

    resolveId(id: string) {
      // Prefix with \x00 so Vite treats this as a virtual module and serves it
      // via /@id/__x00__astro-marko-style:... (a valid HTTP URL). Without \x00,
      // Vite injects the raw astro-marko-style: URL into the page for HMR and
      // the browser gets a CORS error trying to fetch a custom protocol.
      if (id.startsWith(STYLE_PREFIX)) return '\x00' + id;
    },

    async load(id: string) {
      // Vite passes \x00-prefixed IDs to load after our resolveId adds the prefix
      const bare = id.startsWith('\x00') ? id.slice(1) : id;
      if (!bare.startsWith(STYLE_PREFIX)) return;
      // Strip query params (e.g. ?inline added by Astro's dev CSS collector),
      // then strip the .css suffix we added to avoid @marko/vite's .marko transform
      const filePath = bare.slice(STYLE_PREFIX.length).replace(/\?.*$/, '').replace(/\.css$/, '');
      const source = await fs.readFile(filePath, 'utf-8');
      return { code: extractStyles(source), map: null, moduleType: 'css' as const };
    },
  };
}

/**
 * Part 2 (post): after @marko/vite compiles .marko files, rewrites the
 * virtual CSS imports it generates into `astro-marko-style:` imports that
 * our resolver plugin (above) owns.
 */
function markoStyleTransformPlugin() {
  return {
    name: 'astro-marko:styles-transform',
    enforce: 'post' as const,

    transform(code: string, id: string, options?: { ssr?: boolean }) {
      // Only rewrite in SSR. In client builds, @marko/vite handles its own
      // virtual CSS imports natively — rewriting them to astro-marko-style:
      // would cause the browser to try fetching an invalid protocol URL.
      if (!options?.ssr) return;
      if (!id.endsWith('.marko') || !VIRTUAL_CSS_RE.test(code)) return;
      VIRTUAL_CSS_RE.lastIndex = 0;

      // Replace: import "./Foo.marko?marko-virtual&id=Foo.marko.css"
      // With:    import "astro-marko-style:/abs/path/to/Foo.marko"
      const dir = path.dirname(id);
      return {
        code: code.replace(VIRTUAL_CSS_RE, (_match, virtualUrl: string) => {
          const filePath = virtualUrl.slice(0, virtualUrl.indexOf('?'));
          const absPath = path.resolve(dir, filePath);
          return `"${STYLE_PREFIX}${absPath}.css"`;
        }),
        map: null,
      };
    },
  };
}

/**
 * Wraps @marko/vite's plugins to skip Vite virtual module IDs (\x00 prefix).
 * Astro creates virtual entry points like \x00astro-entry:/path/Hello.marko for
 * island client bundles. @marko/vite sees the .marko suffix and tries to compile
 * them, then calls readdirSync on a nonsense path and crashes.
 * The \x00 prefix is Vite's convention for "already resolved virtual module —
 * don't process as a real file." @marko/vite should respect this but doesn't.
 */
function guardedMarkoVite(options: { linked: boolean }) {
  const plugins = markoVite(options) as unknown as Array<{
    transform?: (code: string, id: string, options?: unknown) => unknown;
    [key: string]: unknown;
  }>;
  const list = Array.isArray(plugins) ? plugins : [plugins];
  return list.map((plugin) => {
    if (!plugin?.transform) return plugin;
    const original = plugin.transform;
    return {
      ...plugin,
      transform(code: string, id: string, opts?: TransformOptions) {
        if (id.startsWith('\x00')) return null;
        // @marko/vite 5.x detects SSR mode via opts.ssr. In Vite 7's Environment
        // API (used by Astro 6), the prerender environment no longer sets opts.ssr
        // — SSR context is conveyed via this.environment.name instead. Shim it so
        // @marko/vite compiles in html (SSR) mode rather than dom (browser) mode.
        const envName = (this as unknown as EnvironmentPluginContext).environment?.name;
        const effectiveOpts: TransformOptions =
          envName !== undefined && envName !== 'client' && !opts?.ssr
            ? { ...opts, ssr: true }
            : (opts ?? {});
        return original.call(this, code, id, effectiveOpts);
      },
    };
  });
}

function extractStyles(source: string): string {
  const styles: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let match: RegExpExecArray | null;
  while ((match = styleRe.exec(source)) !== null) {
    styles.push(match[1]);
  }
  return styles.join('\n');
}

export default function marko(): AstroIntegration {
  return {
    name: 'astro-marko',
    hooks: {
      'astro:config:setup': ({ addRenderer, updateConfig }) => {
        addRenderer({
          name: 'astro-marko',
          serverEntrypoint: '@andystewartdesign/astro-marko/server',
          clientEntrypoint: '@andystewartdesign/astro-marko/client',
        });

        updateConfig({
          vite: {
            // Cast needed: Astro bundles its own Vite, causing structural type
            // mismatch between vite@6 (Astro) and vite@8 (@marko/vite peer).
            // The plugin API is compatible at runtime.
            plugins: [markoIslandResolverPlugin(), markoStyleResolverPlugin(), guardedMarkoVite({ linked: false }), markoStyleTransformPlugin()] as any,
          },
        });
      },

      'astro:config:done': ({ injectTypes }) => {
        injectTypes({
          filename: 'types/astro-marko.d.ts',
          content: `declare module "*.marko" {
  import type { Template } from "marko";
  const template: Template;
  export default template;
}
`,
        });
      },
    },
  };
}
