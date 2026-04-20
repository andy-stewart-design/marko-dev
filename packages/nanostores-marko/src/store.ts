import { atom } from "nanostores";
import type { WritableAtom } from "nanostores";

export type TypedKey<T> = string & { readonly __type?: T };

const registry = new Map<string, WritableAtom<unknown>>();
let counter = 0;

export function createStore<T>(initialValue: T): TypedKey<T> {
  const key = `__nano_${counter++}` as TypedKey<T>;
  registry.set(key, atom(initialValue) as WritableAtom<unknown>);
  return key;
}

export function getStore<T>(key: TypedKey<T>): WritableAtom<T> {
  const store = registry.get(key);
  if (!store) throw new Error(`@nanostores/marko: no store registered for key "${key}"`);
  return store as WritableAtom<T>;
}

/** @internal Used by the <store> tag. Not part of the public API. */
export function _getStore(key: string): WritableAtom<unknown> {
  const store = registry.get(key);
  if (!store) throw new Error(`@nanostores/marko: no store registered for key "${key}"`);
  return store;
}
