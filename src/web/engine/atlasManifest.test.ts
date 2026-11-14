import { describe, expect, it } from 'vitest';
import { composeAtlases, type Atlas, type Frame } from './atlas';
import {
  AtlasManifestSchema,
  buildManifestAtlas,
  resolveUrl,
  tryLoadManifestAtlas,
} from './atlasManifest';

const img = (id: string) => ({ id }) as unknown as CanvasImageSource;
const frame = (name: string): Frame => ({
  source: img(name),
  sx: 0,
  sy: 0,
  sw: 16,
  sh: 32,
  ax: 0,
  ay: 16,
});

const manifest = {
  schema: 'atlas/v1' as const,
  sheets: { chars: 'sprites/chars.png', tiles: 'tilesets/interior.png' },
  frames: {
    'npc-livia/walk/s/0': { sheet: 'chars', x: 0, y: 0, w: 16, h: 32, ax: 0, ay: 16 },
    'npc-livia/walk/s/1': { sheet: 'missing', x: 16, y: 0, w: 16, h: 32 },
  },
  tileset: { sheet: 'tiles', columns: 32, tileSize: 16 },
};

describe('atlas manifest (swappable art)', () => {
  it('CA-82: parses a manifest and rejects a wrong schema or bad frames', () => {
    expect(AtlasManifestSchema.safeParse(manifest).success).toBe(true);
    expect(AtlasManifestSchema.safeParse({ ...manifest, schema: 'atlas/v2' }).success).toBe(false);
    expect(
      AtlasManifestSchema.safeParse({
        ...manifest,
        frames: { a: { sheet: 'x', x: -1, y: 0, w: 1, h: 1 } },
      }).success,
    ).toBe(false);
  });

  it('CA-82: resolves sheet URLs relative to the manifest', () => {
    expect(resolveUrl('/assets/sprites/manifest.json', 'chars.png')).toBe(
      '/assets/sprites/chars.png',
    );
    expect(resolveUrl('/assets/sprites/manifest.json', '/abs.png')).toBe('/abs.png');
    expect(resolveUrl('/assets-private/sprites/manifest.json', '../tilesets/a.png')).toBe(
      '/assets-private/sprites/../tilesets/a.png',
    );
  });

  it('CA-82: builds frames and tiles, and reports (not throws) frames whose sheet failed to load', async () => {
    const urls: string[] = [];
    const { atlas, problems } = await buildManifestAtlas(
      AtlasManifestSchema.parse(manifest),
      '/assets/sprites/manifest.json',
      async (url) => {
        urls.push(url);
        return img(url);
      },
    );
    expect(urls.sort()).toEqual([
      '/assets/sprites/sprites/chars.png',
      '/assets/sprites/tilesets/interior.png',
    ]);
    expect(atlas.frame('npc-livia/walk/s/0')).toMatchObject({ sx: 0, sw: 16, sh: 32, ay: 16 });
    expect(atlas.frame('npc-livia/walk/s/1')).toBeUndefined();
    expect(problems.join()).toContain('missing');
    expect(atlas.providesTiles).toBe(true);
    expect(atlas.tile(33)).toMatchObject({ sx: 16, sy: 16 });
    expect(atlas.tile(0)).toBeUndefined();
  });

  it('CA-82: a missing or invalid manifest simply means "no override"', async () => {
    expect(
      await tryLoadManifestAtlas('/x/manifest.json', async () =>
        Promise.reject(new Error('HTTP 404')),
      ),
    ).toBeNull();
    expect(
      await tryLoadManifestAtlas('/x/manifest.json', async () => ({ nonsense: true })),
    ).toBeNull();
  });

  it('CA-82: real art overrides placeholders by name, everything else falls through', () => {
    const real: Atlas = {
      providesTiles: false,
      frame: (n) => (n === 'npc-livia/walk/s/0' ? frame('REAL') : undefined),
      tile: () => undefined,
    };
    const placeholder: Atlas = {
      providesTiles: false,
      frame: (n) => frame(`PLACEHOLDER:${n}`),
      tile: (id) => (id > 0 ? frame('tile') : undefined),
    };
    const composed = composeAtlases([real, placeholder]);
    expect((composed.frame('npc-livia/walk/s/0')?.source as unknown as { id: string }).id).toBe(
      'REAL',
    );
    expect((composed.frame('npc-bruno/walk/s/0')?.source as unknown as { id: string }).id).toBe(
      'PLACEHOLDER:npc-bruno/walk/s/0',
    );
    expect(composed.tile(5)).toBeDefined();
  });

  it('CA-82: a sized request falls back to a fixed-size sprite of the same name', () => {
    const real: Atlas = {
      providesTiles: false,
      frame: (n) => (n === 'props/plant' ? frame('PLANT') : undefined),
      tile: () => undefined,
    };
    expect(composeAtlases([real]).frame('props/plant@1x1')).toBeDefined();
    expect(composeAtlases([real]).frame('props/other@1x1')).toBeUndefined();
  });
});
