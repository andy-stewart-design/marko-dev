type MarkoTemplate = {
  (...args: unknown[]): unknown;
  render(input: Record<string, unknown>): PromiseLike<string>;
  // Internal Marko v6 property: the template file path (e.g. "Hello.marko")
  a?: string;
};

function isMarkoTemplate(Component: unknown): Component is MarkoTemplate {
  return (
    typeof Component === 'function' &&
    typeof (Component as MarkoTemplate).render === 'function'
  );
}

/**
 * Converts Astro's slot children (HTML strings) into plain strings and merges
 * them into the component input.
 *
 * Convention:
 *   - `children.default` → `input.content`  (Marko's standard default slot key)
 *   - `children[name]`   → `input[name]`    (named slots)
 *
 * Template authors render slots with: $!{input.content}  (unescaped HTML)
 * Named slots with: $!{input.slotName}
 */
function buildSlotInput(children: Record<string, unknown>): Record<string, string> {
  const slotInput: Record<string, string> = {};
  for (const [name, value] of Object.entries(children)) {
    if (!value) continue;
    slotInput[name === 'default' ? 'content' : name] = String(value);
  }
  return slotInput;
}

export function check(Component: unknown): boolean {
  return isMarkoTemplate(Component);
}

export async function renderToStaticMarkup(
  Component: unknown,
  props: Record<string, unknown>,
  children: Record<string, unknown> = {},
): Promise<{ html: string }> {
  if (!isMarkoTemplate(Component)) {
    throw new Error('astro-marko: renderToStaticMarkup called with a non-Marko component');
  }
  const html = await Component.render({ ...props, ...buildSlotInput(children) });
  return { html };
}

export default { check, renderToStaticMarkup };
