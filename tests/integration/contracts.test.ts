import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildJsonSchemas, EscritorioSchema, serializeSchema } from '../../src/shared/contracts';

const root = join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');

describe('contracts against real files', () => {
  it('CA-12: docs/.../escritorio.proposta.json validates against the escritorio/v1 contract', () => {
    const proposal = JSON.parse(
      read('docs', 'projeto', '2026-11-12-escritorio-equipe', 'escritorio.proposta.json'),
    );
    const parsed = EscritorioSchema.safeParse(proposal);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  });

  it('CA-25: schemas/*.json are up to date with the zod contracts (run npm run schemas:gen)', () => {
    for (const [file, doc] of Object.entries(buildJsonSchemas())) {
      expect(read('schemas', file), file).toBe(serializeSchema(doc));
    }
  });
});
