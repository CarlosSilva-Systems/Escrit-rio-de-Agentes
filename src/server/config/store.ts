import { EventEmitter } from 'node:events';
import { PublicConfigSchema, type ConfigPatch, type PublicConfig } from '../../shared/contracts';
import { readJsonTolerant, writeFileAtomic } from '../home/fsAtomic';
import type { HomePaths } from '../home/paths';

export const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  lang: 'pt-BR',
  sound: false,
  music: false,
  quality: 'auto',
  approvalDeadlineSec: 60,
  chatMode: {},
  npcWorkPlace: 'desk',
};

/**
 * `config.json`: the settings the browser may read/change (closed list, CA-31).
 * Reading is tolerant: an invalid field falls back to its default and is reported, never thrown.
 */
export class ConfigStore extends EventEmitter {
  private current: PublicConfig = { ...DEFAULT_PUBLIC_CONFIG };
  /** Names of fields that were invalid on load (the file is left untouched). */
  readonly invalidFields: string[] = [];

  constructor(private readonly paths: HomePaths) {
    super();
  }

  async load(): Promise<void> {
    const raw = await readJsonTolerant(this.paths.configFile);
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const next: Record<string, unknown> = { ...DEFAULT_PUBLIC_CONFIG };
    this.invalidFields.length = 0;
    for (const [field, schema] of Object.entries(PublicConfigSchema.shape)) {
      if (!(field in source)) continue;
      const parsed = schema.safeParse((source as Record<string, unknown>)[field]);
      if (parsed.success) next[field] = parsed.data;
      else this.invalidFields.push(field);
    }
    this.current = next as PublicConfig;
  }

  get(): PublicConfig {
    return this.current;
  }

  /** Applies an already-validated patch (`ConfigPatchSchema`) and persists atomically. */
  async update(patch: ConfigPatch): Promise<PublicConfig> {
    const { chatMode, ...rest } = patch;
    const merged = {
      ...this.current,
      ...rest,
      chatMode: chatMode ? { ...this.current.chatMode, ...chatMode } : this.current.chatMode,
    };
    const parsed = PublicConfigSchema.parse(merged);
    await writeFileAtomic(this.paths.configFile, `${JSON.stringify(parsed, null, 2)}\n`);
    this.current = parsed;
    this.emit('changed', parsed);
    return parsed;
  }
}
