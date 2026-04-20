/// <reference types="astro/client" />

// Ambient declaration for .marko imports.
// Provides basic TypeScript compatibility — props are typed as `any` until
// full Input type inference is available via @marko/language-tools integration.
// See .claude/plans/marko-team-questions.md for the open question.
declare module '*.marko' {
  import type { Template } from 'marko';
  const template: Template;
  export default template;
}
