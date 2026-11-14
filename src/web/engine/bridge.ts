// Lets HUD code (drawers, NPC cards, minimap, kanban) reach the running engine without importing the
// React view: `getEngine()?.centerOnRoom('PRJ1')`, `getEngine()?.follow(key)`. Components that must
// re-render when the engine appears use `useEngine()`.

import { useSyncExternalStore } from 'react';
import type { OfficeEngine } from './engine';
import type { NpcManager } from './npc/manager';

let currentEngine: OfficeEngine | null = null;
let currentNpcs: NpcManager | null = null;
const listeners = new Set<() => void>();

export function setEngine(engine: OfficeEngine | null, npcs: NpcManager | null = null): void {
  currentEngine = engine;
  currentNpcs = npcs;
  for (const l of [...listeners]) l();
}

export function getEngine(): OfficeEngine | null {
  return currentEngine;
}

export function getNpcs(): NpcManager | null {
  return currentNpcs;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function useEngine(): OfficeEngine | null {
  return useSyncExternalStore(subscribe, getEngine, getEngine);
}
