type MarkoTemplate = {
  mount(input: Record<string, unknown>, node: Element, position?: string): void;
};

function isMarkoTemplate(Component: unknown): Component is MarkoTemplate {
  return (
    Component != null &&
    typeof (Component as MarkoTemplate).mount === "function"
  );
}

/**
 * Astro client entrypoint for Marko islands.
 *
 * Astro's island runtime calls hydrator(element) first, then calls the
 * returned function with (Component, props, slots, opts). This curried
 * interface is required — see astro-island.prebuilt.js.
 *
 * NOTE: This is client-side rendering, not true SSR hydration. Marko v6's
 * mount() builds a fresh reactive DOM rather than reconciling against
 * server-rendered markup. True hydration (matching server output) is a
 * pending question for the Marko team — see marko-team-questions.md Q2.
 *
 * SLOTS: Marko DOM mode requires slot content to be a compiled Marko template
 * (with ___id), not a raw HTML string. We pass slot HTML strings as regular
 * props so templates can opt-in via innerHTML if needed:
 *   default slot  → input.content     (string)
 *   named slots   → input[slotName]   (string)
 *
 * Template authors who want client-side slot rendering can use:
 *   <div innerHTML=input.content/>    (default slot)
 *   <div innerHTML=input.mySlot/>     (named slot)
 */
export default (element: Element) =>
  (
    Component: unknown,
    props: Record<string, unknown>,
    slots: Record<string, string> = {},
  ): void => {
    if (!isMarkoTemplate(Component)) {
      throw new Error(
        "astro-marko: client hydrator received a non-Marko component",
      );
    }

    // Merge slot HTML strings into input under their Marko-conventional names.
    // default → content, named slots keep their name.
    const slotProps: Record<string, string> = {};
    for (const [name, html] of Object.entries(slots)) {
      if (html) slotProps[name === "default" ? "content" : name] = html;
    }

    // Clear server-rendered content so mount() doesn't duplicate it
    element.innerHTML = "";
    Component.mount({ ...props, ...slotProps }, element);
  };
