# MDX → MD Export Pipeline

Convert MDX content files to plain Markdown by SSR-rendering any embedded components to HTML, then converting that HTML to Markdown. The result is a standard `.md` file with no JSX dependencies.

## The Pipeline

```
MDX file → parse AST → find component nodes → SSR render → HTML → Markdown → .md file
```

## Tools for Each Step

**1. Parse MDX to AST**
Use `unified` + `remark-mdx`. Component usages appear as `mdxJsxFlowElement` and `mdxJsxTextElement` nodes you can visit and replace.

**2. Render Marko components to HTML**
Marko 6 has a built-in SSR API:
```js
import Component from './MyComponent.marko'
const html = await Component.render(props).toHTML()
```
Dynamically import components by name, pass static props extracted from the MDX AST attributes, and get HTML back.

**3. Convert HTML → Markdown**
`turndown` is the standard choice. Or stay in the `unified` ecosystem with `rehype-parse` + `rehype-remark` + `remark-stringify` for a cleaner pipeline.

**4. Serialize back to `.md`**
Replace the component AST nodes with the remark markdown AST nodes from step 3, then `remark-stringify` to get the final `.md` output.

## Rough Sketch

```js
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkStringify from 'remark-stringify'
import { visit } from 'unist-util-visit'
import TurndownService from 'turndown'

async function mdxToMd(filePath) {
  const source = await fs.readFile(filePath, 'utf8')
  const processor = unified().use(remarkParse).use(remarkMdx)
  const tree = processor.parse(source)

  const replacements = []

  visit(tree, ['mdxJsxFlowElement', 'mdxJsxTextElement'], (node, index, parent) => {
    replacements.push({ node, index, parent })
  })

  // Process in reverse order so indices don't shift
  for (const { node, index, parent } of replacements.reverse()) {
    const componentName = node.name
    const props = extractStaticProps(node.attributes)

    const Component = await import(`../components/${componentName}.marko`)
    const html = await Component.render(props).toHTML()

    const td = new TurndownService({ headingStyle: 'atx' })
    const markdown = td.turndown(html)

    // Replace with a raw markdown node
    parent.children.splice(index, 1, {
      type: 'html',
      value: markdown // or parse into proper remark nodes
    })
  }

  return unified().use(remarkStringify).stringify(tree)
}
```

## Challenges to Anticipate

**Static props only** — This works cleanly when component props are literal values (`title="Foo"`, `count={42}`). MDX expressions like `<Chart data={chartData} />` where `chartData` is a runtime variable can't be resolved statically. You'll need to decide whether to skip those or error on them.

**Marko compiler setup** — The script needs Marko's Node.js register hook so `.marko` imports work:
```js
import '@marko/node-require' // or equivalent for Marko 6
```
Or run through a bundler/loader that handles `.marko` files.

**Component dependencies** — Components that fetch data, read context, or depend on Astro's runtime won't render cleanly in isolation. Design exportable components to be self-contained — data in via props only.

**Interactive components** — A convention like `data-export-skip` could mark components to strip or replace with a placeholder rather than attempting to render them.

## Design Principle

Build components so they SSR to meaningful semantic HTML — a `<Table>`, `<CodeBlock>`, `<Callout>` etc. that renders proper `<table>`, `<pre><code>`, `<blockquote>` and so on. Semantic HTML → clean Markdown conversion is essentially lossless with `turndown`. Components that emit unsemantic `<div>` soup will produce ugly Markdown output.
