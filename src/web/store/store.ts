// Minimal external store (no state library, bundle budget): `getState`, `setState`, `subscribe`.
// React reads it through `useStore` (useSyncExternalStore), so only components whose selected slice
// changed re-render.

export type Listener = () => void;

export interface Store<T> {
  getState(): T;
  setState(update: Partial<T> | ((state: T) => Partial<T>)): void;
  subscribe(listener: Listener): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    setState(update) {
      const patch = typeof update === 'function' ? update(state) : update;
      const keys = Object.keys(patch) as (keyof T)[];
      if (keys.every((k) => Object.is(state[k], patch[k]))) return;
      state = { ...state, ...patch };
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
