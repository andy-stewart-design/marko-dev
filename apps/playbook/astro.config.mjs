// @ts-check
import { defineConfig } from 'astro/config';

import marko from 'astro-marko';

// https://astro.build/config
export default defineConfig({
  integrations: [marko()]
});