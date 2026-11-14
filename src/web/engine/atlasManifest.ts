// Atlas manifest (`atlas/v1`): lets real art (PNG sheets in assets/ or assets-private/) override the
// code-drawn placeholders by frame name, with no engine changes.
//
//   { "schema": "atlas/v1",
//     "sheets": { "chars": "characters.png", "tiles": "../tilesets/interior.png" },
//     "frames": { "npc-livia/walk/s/0": { "sheet": "chars", "x": 0, "y": 0, "w": 16, "h": 32, "ax": 0, "ay": 16 } },
//     "tileset": { "sheet": "tiles", "columns": 32, "tileSize": 16 } }
//
// Sheet paths are relative to the manifest's own URL.

import { z } from 'zod';
import type { Atlas, Frame } from './atlas';

export const AtlasManifestSchema = z.object({
  schema: z.literal('atlas/v1'),
  sheets: z.record(z.string(), z.string().min(1).max(200)),
  frames: z
    .record(
      z.string().min(1).max(120),
      z.object({
        sheet: z.string(),
        x: z.number().int().nonnegative(),
        y: z.number().int().nonnegative(),
        w: z.number().int().positive(),
        h: z.number().int().positive(),
        ax: z.number().int().default(0),
        ay: z.number().int().default(0),
      }),
    )
    .default({}),
  tileset: z
    .object({
      sheet: z.string(),
      columns: z.number().int().positive(),
      tileSize: z.number().int().positive().default(16),
    })
    .optional(),
});
export type AtlasManifest = z.infer<typeof AtlasManifestSchema>;

export type ImageLoader = (url: string) => Promise<CanvasImageSource>;

/** Resolves `relative` against `base` (a manifest URL) without needing `window.location`. */
export function resolveUrl(base: string, relative: string): string {
  if (/^[a-z]+:\/\//i.test(relative) || relative.startsWith('/')) return relative;
  const dir = base.slice(0, base.lastIndexOf('/') + 1);
  return dir + relative;
}

export const fetchImage: ImageLoader = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image ${url}: HTTP ${res.status}`);
  return createImageBitmap(await res.blob());
};

export interface ManifestAtlasResult {
  atlas: Atlas;
  /** Sheets or frames that could not be used (never thrown: art is optional). */
  problems: string[];
}

/** Builds an atlas from a parsed manifest. Frames pointing at missing sheets are skipped. */
export async function buildManifestAtlas(
  manifest: AtlasManifest,
  manifestUrl: string,
  loadImage: ImageLoader = fetchImage,
): Promise<ManifestAtlasResult> {
  const problems: string[] = [];
  const images = new Map<string, CanvasImageSource>();
  await Promise.all(
    Object.entries(manifest.sheets).map(async ([id, rel]) => {
      try {
        images.set(id, await loadImage(resolveUrl(manifestUrl, rel)));
      } catch (error) {
        problems.push(
          `sheet "${id}": ${error instanceof Error ? error.message : 'failed to load'}`,
        );
      }
    }),
  );

  const frames = new Map<string, Frame>();
  for (const [name, def] of Object.entries(manifest.frames)) {
    const source = images.get(def.sheet);
    if (!source) {
      problems.push(`frame "${name}": sheet "${def.sheet}" unavailable`);
      continue;
    }
    frames.set(name, {
      source,
      sx: def.x,
      sy: def.y,
      sw: def.w,
      sh: def.h,
      ax: def.ax,
      ay: def.ay,
    });
  }

  const tilesetImage = manifest.tileset ? images.get(manifest.tileset.sheet) : undefined;
  const tileset = manifest.tileset;
  return {
    problems,
    atlas: {
      providesTiles: Boolean(tileset && tilesetImage),
      frame: (name) => frames.get(name),
      tile(id) {
        if (!tileset || !tilesetImage || id <= 0) return undefined;
        const size = tileset.tileSize;
        return {
          source: tilesetImage,
          sx: (id % tileset.columns) * size,
          sy: Math.floor(id / tileset.columns) * size,
          sw: size,
          sh: size,
          ax: 0,
          ay: 0,
        };
      },
    },
  };
}

/** Fetches `<base>/sprites/manifest.json`; resolves to null when it does not exist or is invalid. */
export async function tryLoadManifestAtlas(
  manifestUrl: string,
  fetchJson: (url: string) => Promise<unknown> = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  loadImage: ImageLoader = fetchImage,
): Promise<ManifestAtlasResult | null> {
  let raw: unknown;
  try {
    raw = await fetchJson(manifestUrl);
  } catch {
    return null;
  }
  const parsed = AtlasManifestSchema.safeParse(raw);
  if (!parsed.success) return null;
  return buildManifestAtlas(parsed.data, manifestUrl, loadImage);
}
