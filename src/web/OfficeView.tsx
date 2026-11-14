import { useEffect, useRef, useState } from 'react';
import type { ZoomLevel } from '../shared/world/camera';
import { useAppState, useServices, useT } from './AppContext';
import { setEngine } from './engine/bridge';
import { createDemoWalkers } from './engine/demo';
import { OfficeEngine } from './engine/engine';
import { NpcManager } from './engine/npc/manager';
import { loadWorld, type LoadedWorld } from './engine/world/loadWorld';
import { DebugOverlay } from './hud/debug/DebugOverlay';
import { hideHoverNow, hideHoverSoon, showHover } from './hud/npc/hover';
import { npcInfo } from './hud/npc/npcInfo';
import type { OfficeParams } from './params';

declare global {
  interface Window {
    /** Present only with `?debug`: engine handle for the overlay, the spike and the e2e tests. */
    __officeDebug?: {
      engine: OfficeEngine;
      metrics: () => ReturnType<OfficeEngine['metrics']>;
      crispness: () => ReturnType<OfficeEngine['crispness']>;
      frameTimestamps: () => number[];
      /** Behaviour state of every NPC (mode, animation, tile). Empty with `?demo`. */
      npcs: () => ReturnType<NpcManager['debug']>;
      rooms: string[];
      diagnostics: string[];
    };
  }
}

export function OfficeView({ params }: { params: OfficeParams }) {
  const t = useT();
  const { store } = useServices();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useAppState((s) => s.reducedMotion);
  const followKey = useAppState((s) => s.ui.followKey);
  const followedName = useAppState((s) =>
    s.ui.followKey ? (npcInfo(s.snapshot, s.ui.followKey)?.name ?? null) : null,
  );
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const [loaded, setLoaded] = useState<LoadedWorld | null>(null);
  const [engine, setEngineState] = useState<OfficeEngine | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [zoom, setZoom] = useState<ZoomLevel>(params.zoom ?? 2);

  useEffect(() => {
    let cancelled = false;
    loadWorld()
      .then((result) => {
        if (!cancelled) setLoaded(result);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    const manager = new NpcManager(loaded.world, loaded.atlas, {
      reducedMotion: () => reducedRef.current,
      onTeamChange: (change) =>
        store.setState({
          notice: {
            id: Date.now(),
            hired: change.added.map((a) => a.nickname),
            left: change.removed.map((a) => a.nickname),
            provisional: change.added.filter((a) => a.provisional).map((a) => a.nickname),
          },
        }),
    });
    const instance = new OfficeEngine({
      canvas,
      loaded,
      // `?demo=N` keeps the S-02 walkers; otherwise the team lives from the server state.
      simulation:
        params.demo > 0
          ? createDemoWalkers(loaded.world, params.demo, { seed: params.seed })
          : manager,
      zoom: params.zoom,
      debugTime: params.debugTime,
      rain: params.rain,
      quality: params.quality,
      reducedMotion: () => reducedRef.current,
      onZoomChange: setZoom,
      logFrames: params.debug,
      dirtyRegions: params.dirty,
      onFollowChange: (key) => store.setState((s) => ({ ui: { ...s.ui, followKey: key } })),
      onNpcHover: (id) => {
        if (!id) return hideHoverSoon(store);
        const anchor = instance.anchorOfSprite(id);
        if (anchor) showHover(store, { key: id, x: Math.round(anchor.x), y: Math.round(anchor.y) });
      },
      // A click on an NPC opens (or switches) its panel; a click on empty floor closes it.
      onNpcClick: (id) => store.setState((s) => ({ ui: { ...s.ui, selectedNpc: id } })),
    });

    // Server state -> NPCs. Team first (seats), then logical status; each only when it changed.
    let lastTeam: unknown = null;
    let lastNpcs: unknown = null;
    const sync = () => {
      const snap = store.getState().snapshot;
      if (!snap) return;
      if (snap.team !== lastTeam) {
        lastTeam = snap.team;
        manager.syncTeam(snap.team);
      }
      if (snap.npcs !== lastNpcs) {
        lastNpcs = snap.npcs;
        manager.syncNpcs(snap.npcs);
      }
      instance.wake();
    };
    const unsubscribe = store.subscribe(sync);
    sync();

    setEngine(instance, manager);
    setEngineState(instance);
    if (params.debug) {
      window.__officeDebug = {
        engine: instance,
        metrics: () => instance.metrics(),
        crispness: () => instance.crispness(),
        frameTimestamps: () => instance.frameTimestamps(),
        npcs: () => manager.debug(),
        rooms: loaded.world.map.rooms.map((r) => r.id),
        diagnostics: loaded.diagnostics,
      };
    }
    instance.start();
    return () => {
      unsubscribe();
      hideHoverNow(store);
      instance.destroy();
      setEngine(null);
      setEngineState(null);
      delete window.__officeDebug;
    };
  }, [loaded, params, store]);

  const changeZoom = (direction: 1 | -1) => engine?.zoomBy(direction);

  return (
    <div className="office" id="office">
      <canvas
        ref={canvasRef}
        className="office__canvas"
        role="application"
        aria-roledescription={t('map.roledescription')}
        aria-label={t('map.aria')}
        data-testid="office-canvas"
      />
      {loadFailed && (
        <p className="office__loading" role="alert">
          {t('map.error')}
        </p>
      )}
      {!loaded && !loadFailed && (
        <p className="office__loading" role="status">
          {t('map.loading')}
        </p>
      )}
      <div className="map-controls" role="group" aria-label={t('map.controls')}>
        <button
          type="button"
          className="btn btn--icon"
          aria-label={t('map.zoom.out')}
          disabled={!engine || zoom <= 2}
          onClick={() => changeZoom(-1)}
        >
          −
        </button>
        <span className="map-controls__level" aria-live="polite">
          {t('map.zoom.level', { n: zoom })}
        </span>
        <button
          type="button"
          className="btn btn--icon"
          aria-label={t('map.zoom.in')}
          disabled={!engine || zoom >= 4}
          onClick={() => changeZoom(1)}
        >
          +
        </button>
        {followKey && followedName && (
          <>
            <span className="map-controls__following" data-testid="following">
              {t('team.following', { nome: followedName })}
            </span>
            <button type="button" className="btn" onClick={() => engine?.follow(null)}>
              {t('team.unfollow')}
            </button>
          </>
        )}
      </div>
      {params.debug && <DebugOverlay engine={engine} source={loaded?.source ?? null} />}
    </div>
  );
}
