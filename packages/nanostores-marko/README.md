# @andystewartdesign/nanostores-marko

[Nanostores](https://github.com/nanostores/nanostores) shared state for [Marko 6](https://markojs.com), with full type inference.

> **Alpha POC** — this is an early proof of concept. The API may change.

## Installation

```bash
npm install @andystewartdesign/nanostores-marko nanostores
```

## Usage

### 1. Define your stores

Create a module that exports your stores. These can be imported anywhere in your app.

```ts
// src/stores/counter.ts
import { createStore } from "@andystewartdesign/nanostores-marko";

export const $counter = createStore(0);
export const $name = createStore("world");
```

`createStore` returns a serializable key (a plain string with a phantom type) that is registered in a module-level store registry. Passing a plain string means Marko can safely serialize it for SSR hydration.

### 2. Use the `<store>` tag in your components

```marko
// counter.marko
import { $counter } from "./stores/counter.ts";

<store/count=$counter/>

<div>
  <p>Count: ${count}</p>
  <button onClick() { count++ }>+</button>
  <button onClick() { count-- }>-</button>
</div>
```

The `<store>` tag subscribes to the store and exposes its value as a local variable. The type of `count` is inferred automatically from the store's initial value — no manual type annotations needed.

Assigning to the variable (`count++`, `count = newValue`) updates the store directly, so any other component subscribed to `$counter` will react.

### 3. Shared state across components

Because stores live in a shared module, any number of components can subscribe to the same store and will stay in sync on the client.

```marko
// input-a.marko
import { $name } from "./stores/counter.ts";

<store/name=$name/>
<input type="text" value:=name>
```

```marko
// input-b.marko
import { $name } from "./stores/counter.ts";

<store/name=$name/>
<p>Hello, ${name}!</p>
```

## API

### `createStore<T>(initialValue: T): TypedKey<T>`

Creates a nanostores `atom` and registers it under an auto-generated key. Returns the key, which you pass to the `<store>` tag. The generic type `T` is carried through via a phantom type on the key string, enabling end-to-end type inference.

### `getStore<T>(key: TypedKey<T>): WritableAtom<T>`

Returns the underlying nanostores `WritableAtom` for a given key. Useful if you need to read or write the store value outside of a Marko template — for example in event handlers or utility functions.

```ts
import { getStore } from "@andystewartdesign/nanostores-marko";
import { $counter } from "./stores/counter.ts";

getStore($counter).set(0); // reset
getStore($counter).get();  // read current value
```

## A note on `<store>` tag internals

The `<store>` tag ships as raw Marko source in `tags/store/index.marko`. Inside, it imports `_getStore` using the package name (`@andystewartdesign/nanostores-marko`) rather than a relative path. This is intentional.

In Vite's dev server, package-name imports go through Vite's dependency pre-bundler, producing a single shared module instance. A relative import like `../../dist/store.js` would bypass pre-bundling and resolve to the raw file — a different module instance from the one the user's `createStore` gets. Two instances means two separate registries, and the store key lookup fails.

Using the package name in both places guarantees both imports resolve through the same Vite module — shared registry, no split.

This is an internal detail and has no effect on consumers of the package. It is called out here for anyone reading the source or contributing to the package.

## How it works

Marko serializes all tag inputs for SSR hydration. Passing a store object directly as a prop fails at runtime because functions can't be serialized. This package works around that by using a string key as the prop — the string is serializable, and the actual `atom` is looked up from a module-level registry on both server and client using that key.
