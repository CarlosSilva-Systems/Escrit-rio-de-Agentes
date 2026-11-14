// Generates schemas/*.json from the zod contracts. Run with: npm run schemas:gen (uses tsx).
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildJsonSchemas, serializeSchema } from '../src/shared/contracts/jsonSchemas.ts';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas');
mkdirSync(outDir, { recursive: true });

for (const [file, doc] of Object.entries(buildJsonSchemas())) {
  const target = join(outDir, file);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, serializeSchema(doc), 'utf8');
  renameSync(tmp, target); // atomic replace
  console.log(`wrote schemas/${file}`);
}
