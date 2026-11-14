// Application state and the pure reducer that folds server messages into it.

import type { OfficeSnapshot, ServerMessage } from '../../shared/contracts';
import { DEFAULT_LANG, type Lang } from '../i18n/i18n';

export type Connection = 'loading' | 'online' | 'offline' | 'unauthorized';
export type PanelId = 'chat' | 'tasks' | 'approvals' | 'map';
export type ModalId = 'credits' | 'shortcuts' | 'logout';

export interface HoverNpc {
  key: string;
  /** Client-pixel anchor (centre of the NPC's head) for the hover card. */
  x: number;
  y: number;
}

export interface UiState {
  panel: PanelId | null;
  modal: ModalId | null;
  menuOpen: boolean;
  /** NPC under the pointer or keyboard focus (hover card). */
  hoverNpc: HoverNpc | null;
  /** NPC whose panel is open (click / Enter). */
  selectedNpc: string | null;
  /** NPC the camera follows. */
  followKey: string | null;
  /** Team drawer (keyboard and screen-reader access to the NPCs). */
  teamOpen: boolean;
}

/** Short announcement for welcome/farewell scenes (role=status). */
export interface Notice {
  id: number;
  /** Nicknames that joined / left in the same change (both can be announced together). */
  hired: string[];
  left: string[];
  /** Hires that landed on a provisional Reception desk (no free desk in their department, CA-21). */
  provisional: string[];
}

export interface AppState {
  connection: Connection;
  /** Seconds until the next reconnect attempt, while offline. */
  retryInSec: number | null;
  lang: Lang;
  /** Sound is muted by default (CA-77). */
  soundOn: boolean;
  reducedMotion: boolean;
  snapshot: OfficeSnapshot | null;
  /** Project name per room slot 0-3 (null = free), from `rooms` messages. */
  roomSlots: (string | null)[];
  ui: UiState;
  notice: Notice | null;
}

export const MAX_ACTIVITY = 200;
export const DEFAULT_TEAM_SIZE = 16;

export function initialState(lang: Lang = DEFAULT_LANG): AppState {
  return {
    connection: 'loading',
    retryInSec: null,
    lang,
    soundOn: false,
    reducedMotion: false,
    snapshot: null,
    roomSlots: [null, null, null, null],
    ui: {
      panel: null,
      modal: null,
      menuOpen: false,
      hoverNpc: null,
      selectedNpc: null,
      followKey: null,
      teamOpen: false,
    },
    notice: null,
  };
}

/**
 * `{t:'npc.remove', key}`: a Freelancer left (server drops it 5 s after Stop). Declared here until the
 * shared WS contract lists it; the reducer already understands it.
 */
export interface NpcRemoveMessage {
  t: 'npc.remove';
  key: string;
}
export type IncomingMessage = ServerMessage | NpcRemoveMessage;

/** Folds one server message into the state. Pure; unknown shapes were already filtered by the schema. */
export function applyServerMessage(state: AppState, msg: IncomingMessage): AppState {
  if (msg.t === 'snapshot') {
    // The server sends activity oldest-first; the store keeps it newest-first (feed order).
    const snapshot = {
      ...msg.snapshot,
      activity: [...msg.snapshot.activity].reverse().slice(0, MAX_ACTIVITY),
    };
    return { ...state, snapshot, soundOn: msg.snapshot.config.sound };
  }
  if (msg.t === 'rooms') return { ...state, roomSlots: msg.slots };

  const snap = state.snapshot;
  if (!snap) return state; // updates before the first snapshot are meaningless; the snapshot wins
  switch (msg.t) {
    case 'npc.remove':
      return snap.npcs.some((n) => n.key === msg.key)
        ? { ...state, snapshot: { ...snap, npcs: snap.npcs.filter((n) => n.key !== msg.key) } }
        : state;
    case 'npc.update': {
      const npcs = snap.npcs.some((n) => n.key === msg.npc.key)
        ? snap.npcs.map((n) => (n.key === msg.npc.key ? msg.npc : n))
        : [...snap.npcs, msg.npc];
      return { ...state, snapshot: { ...snap, npcs } };
    }
    case 'activity': {
      if (snap.activity.some((a) => a.id === msg.item.id)) return state;
      // Newest first, at least 200 kept (CA-80).
      return {
        ...state,
        snapshot: { ...snap, activity: [msg.item, ...snap.activity].slice(0, MAX_ACTIVITY) },
      };
    }
    case 'approval.upsert': {
      const approvals = snap.approvals.some((a) => a.id === msg.approval.id)
        ? snap.approvals.map((a) => (a.id === msg.approval.id ? msg.approval : a))
        : [...snap.approvals, msg.approval];
      return { ...state, snapshot: { ...snap, approvals } };
    }
    case 'approval.remove':
      return {
        ...state,
        snapshot: { ...snap, approvals: snap.approvals.filter((a) => a.id !== msg.id) },
      };
    case 'project.upsert': {
      const projects = snap.projects.some((p) => p.name === msg.project.name)
        ? snap.projects.map((p) => (p.name === msg.project.name ? msg.project : p))
        : [...snap.projects, msg.project];
      return { ...state, snapshot: { ...snap, projects } };
    }
    case 'plan.update':
      return {
        ...state,
        snapshot: {
          ...snap,
          projects: snap.projects.map((p) =>
            p.name === msg.project ? { ...p, plan: msg.plan } : p,
          ),
        },
      };
    case 'usage':
      return { ...state, snapshot: { ...snap, usage: msg.usage } };
    case 'team':
      return { ...state, snapshot: { ...snap, team: msg.team } };
    case 'diag':
      return { ...state, snapshot: { ...snap, diagnostics: msg.diagnostics } };
    default:
      return state; // hello, alert, tokens, chat.*: handled by later blocks
  }
}

// --- Selectors (pure) -------------------------------------------------------------------------

/** Fixed team members that are not idle (working or waiting for an approval). */
export function agentsWorking(snapshot: OfficeSnapshot | null): number {
  if (!snapshot) return 0;
  return snapshot.npcs.filter((n) => n.kind === 'fixed' && n.status !== 'idle').length;
}

export function teamSize(snapshot: OfficeSnapshot | null): number {
  const n = snapshot?.team.agents.length ?? 0;
  return n > 0 ? n : DEFAULT_TEAM_SIZE;
}

export function activeProjects(snapshot: OfficeSnapshot | null): number {
  return snapshot ? snapshot.projects.filter((p) => p.active).length : 0;
}

/** Studio name from the team config, or null (the UI shows the i18n placeholder). */
export function studioName(snapshot: OfficeSnapshot | null): string | null {
  const name = snapshot?.team.studio.name?.trim();
  return name ? name : null;
}
