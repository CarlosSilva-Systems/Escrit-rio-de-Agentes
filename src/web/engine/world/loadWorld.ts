// Loads the world: `assets/map/mapa.json` (validated with the mapa/v1 contract) and the sprite
// atlas (optional manifest over the code-drawn placeholders). Missing or invalid files never break
// the app: the provisional floor plan (MAPA.md transcription) is used and a diagnostic is reported.

import { MapaSchema, type Mapa } from '../../../shared/contracts/mapa';
import { PROCEDURAL_TILESET_IMAGE } from '../../../shared/world/tileIds';
import { buildProvisionalMap } from '../../../shared/world/provisionalMap';
import { composeAtlases, createProceduralAtlas, type Atlas } from '../atlas';
import { tryLoadManifestAtlas } from '../atlasManifest';
import { createWorld, type World } from './world';

export const ASSETS_BASE = '/assets';

export interface LoadedWorld {
  world: World;
  atlas: Atlas;
  /** Where the floor plan came from. */
  source: 'file' | 'provisional';
  diagnostics: string[];
}

export interface LoadWorldOptions {
  fetchJson?: (url: string) => Promise<unknown>;
  assetsBase?: string;
  /** Skips the atlas manifest lookups (tests). */
  skipManifests?: boolean;
}

const defaultFetchJson = async (url: string): Promise<unknown> => {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export async function loadWorld(options: LoadWorldOptions = {}): Promise<LoadedWorld> {
  const base = options.assetsBase ?? ASSETS_BASE;
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const diagnostics: string[] = [];

  // Atlas: private art (assets-private/) overrides public art, which overrides the placeholders.
  const layers: Atlas[] = [];
  if (!options.skipManifests) {
    // Only manifests that existed at build time are requested (undefined in unit tests = none).
    const present = typeof __SPRITE_MANIFESTS__ === 'undefined' ? null : __SPRITE_MANIFESTS__;
    const roots = [present?.private ? `${base}-private` : null, present?.public ? base : null];
    for (const root of roots) {
      if (!root) continue;
      const result = await tryLoadManifestAtlas(`${root}/sprites/manifest.json`);
      if (result) {
        layers.push(result.atlas);
        for (const p of result.problems) diagnostics.push(`atlas: ${p}`);
      }
    }
  }
  layers.push(createProceduralAtlas());
  const atlas = composeAtlases(layers);

  let map: Mapa | null = null;
  let source: LoadedWorld['source'] = 'provisional';
  try {
    const raw = await fetchJson(`${base}/map/mapa.json`);
    const parsed = MapaSchema.safeParse(raw);
    if (parsed.success) {
      map = parsed.data;
      source = 'file';
    } else {
      const first = parsed.error.issues[0];
      diagnostics.push(
        `mapa.json invalid (${first?.path.join('.') ?? '?'}: ${first?.message ?? '?'}); using the provisional map`,
      );
    }
  } catch {
    diagnostics.push('mapa.json not available; using the provisional map');
  }
  map ??= buildProvisionalMap();

  const tileset = map.tilesets[0];
  const tilesetUsable =
    tileset?.image === PROCEDURAL_TILESET_IMAGE || (Boolean(tileset) && atlas.providesTiles);
  const world = createWorld(map, atlas, tilesetUsable);
  diagnostics.push(...world.diagnostics);
  return { world, atlas, source, diagnostics };
}
