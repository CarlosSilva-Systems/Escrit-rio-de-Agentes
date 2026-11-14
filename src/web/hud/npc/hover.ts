// Hover-card bookkeeping shared by the map (pointer) and the team list (keyboard focus).
// The card appears at once (<= 150 ms) and, per WCAG 1.4.13, stays while the pointer is over it.

import type { AppState, HoverNpc } from '../../store/appState';
import type { Store } from '../../store/store';

const HIDE_DELAY_MS = 180;
let timer: number | null = null;
let overCard = false;

function cancel(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
}

export function showHover(store: Store<AppState>, hover: HoverNpc): void {
  cancel();
  const current = store.getState().ui.hoverNpc;
  if (current && current.key === hover.key && current.x === hover.x && current.y === hover.y)
    return;
  store.setState((s) => ({ ui: { ...s.ui, hoverNpc: hover } }));
}

/** Hides after a short grace period so the pointer can travel from the NPC to the card. */
export function hideHoverSoon(store: Store<AppState>, delay = HIDE_DELAY_MS): void {
  cancel();
  timer = window.setTimeout(() => {
    timer = null;
    if (overCard) return;
    store.setState((s) => (s.ui.hoverNpc ? { ui: { ...s.ui, hoverNpc: null } } : {}));
  }, delay);
}

export function hideHoverNow(store: Store<AppState>): void {
  cancel();
  overCard = false;
  store.setState((s) => (s.ui.hoverNpc ? { ui: { ...s.ui, hoverNpc: null } } : {}));
}

export function setOverCard(over: boolean, store: Store<AppState>): void {
  overCard = over;
  if (over) cancel();
  else hideHoverSoon(store);
}
