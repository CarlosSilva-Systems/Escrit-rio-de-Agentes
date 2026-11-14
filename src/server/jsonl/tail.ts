import { open, stat } from 'node:fs/promises';

// Incremental tail of append-only JSONL files (ADR-0006, CA-63): per-file byte offset,
// handles partial last lines, truncation and replacement ("rotation"). The filesystem is
// injected (`TailFs`) so the logic is testable without real files. No timers, no watchers:
// the caller decides when to `poll` (fs.watch event, periodic rescan).
//
// Known limits: a final line without a trailing "\n" is treated as still being written and is
// delivered once the newline arrives; tracking from the END may start in the middle of a line
// (that one fragment is then reported as ignored by the parser).

export interface TailFs {
  /** null when the file does not exist. */
  stat(path: string): Promise<{ size: number; mtimeMs: number } | null>;
  /** Reads up to `length` bytes from `start` (may return fewer at EOF). */
  readRange(path: string, start: number, length: number): Promise<Uint8Array>;
}

export interface TailState {
  /** Bytes consumed so far: always just after a "\n" (or 0). */
  offset: number;
  size: number;
  mtimeMs: number;
  /** Hex of the first (up to) 64 bytes, to detect a replaced file whose size did not shrink. */
  head: string;
}

export interface TailPoll {
  /** Complete lines (no "\n"/"\r\n"), in order. */
  lines: string[];
  /** The file shrank or was replaced: the offset was reset and the file re-read from 0. */
  truncated: boolean;
  /** The file does not exist (state forgotten). */
  gone: boolean;
  /** Lines longer than the limit that were skipped. */
  oversizedLines: number;
  /** More data is available (per-poll byte cap reached): call `poll` again. */
  more: boolean;
}

export interface TailerOptions {
  /** Initial read size per request. Default 1 MiB. */
  chunkBytes?: number;
  /** Max bytes consumed per `poll`. Default 8 MiB. */
  maxBytesPerPoll?: number;
  /** Lines above this are skipped. Default 4 MiB. */
  maxLineBytes?: number;
}

const HEAD_BYTES = 64;
const NL = 0x0a;

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const emptyPoll = (): TailPoll => ({
  lines: [],
  truncated: false,
  gone: false,
  oversizedLines: 0,
  more: false,
});

export class JsonlTailer {
  private readonly states = new Map<string, TailState>();
  private readonly chains = new Map<string, Promise<unknown>>();
  private readonly chunkBytes: number;
  private readonly maxBytesPerPoll: number;
  private readonly maxLineBytes: number;
  private readonly decoder = new TextDecoder('utf-8');

  constructor(
    private readonly fs: TailFs,
    opts: TailerOptions = {},
  ) {
    this.chunkBytes = opts.chunkBytes ?? 1024 * 1024;
    this.maxBytesPerPoll = opts.maxBytesPerPoll ?? 8 * 1024 * 1024;
    this.maxLineBytes = opts.maxLineBytes ?? 4 * 1024 * 1024;
  }

  /** Persistable offsets (cache/tokens.json keeps these; no content). */
  snapshot(): Record<string, TailState> {
    return Object.fromEntries(this.states);
  }

  restore(path: string, state: TailState): void {
    this.states.set(path, { ...state });
  }

  forget(path: string): void {
    this.states.delete(path);
  }

  has(path: string): boolean {
    return this.states.has(path);
  }

  /** Starts tracking at the current end of file: only data appended later is delivered. */
  attachAtEnd(path: string): Promise<boolean> {
    return this.serial(path, async () => {
      const st = await this.fs.stat(path);
      if (!st) return false;
      const head = await this.readHead(path, st.size);
      this.states.set(path, { offset: st.size, size: st.size, mtimeMs: st.mtimeMs, head });
      return true;
    });
  }

  /** Reads what was appended since the last poll (an untracked file is read from the start). */
  poll(path: string): Promise<TailPoll> {
    return this.serial(path, () => this.pollNow(path));
  }

  // Polls of the same file never overlap (they would corrupt the offset).
  private serial<T>(path: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(path) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => undefined);
    this.chains.set(path, tail);
    void tail.then(() => {
      if (this.chains.get(path) === tail) this.chains.delete(path);
    });
    return next;
  }

  private async readHead(path: string, size: number): Promise<string> {
    if (size === 0) return '';
    return toHex(await this.fs.readRange(path, 0, Math.min(HEAD_BYTES, size)));
  }

  private async pollNow(path: string): Promise<TailPoll> {
    const result = emptyPoll();
    const st = await this.fs.stat(path);
    if (!st) {
      this.states.delete(path);
      result.gone = true;
      return result;
    }
    let state = this.states.get(path) ?? { offset: 0, size: 0, mtimeMs: 0, head: '' };

    // Unchanged size AND mtime since the last poll (everything consumed): no head read needed.
    if (
      state.offset > 0 &&
      st.size === state.offset &&
      st.size === state.size &&
      st.mtimeMs === state.mtimeMs
    ) {
      return result;
    }

    // Truncation (shrunk) or replacement (same/larger size but different beginning).
    let reset = st.size < state.offset;
    if (!reset && state.offset > 0 && state.head !== '') {
      const current = toHex(await this.fs.readRange(path, 0, state.head.length / 2));
      reset = current !== state.head;
    }
    if (reset) {
      state = { offset: 0, size: 0, mtimeMs: 0, head: '' };
      result.truncated = true;
    }

    if (st.size === state.offset) {
      this.states.set(path, { ...state, size: st.size, mtimeMs: st.mtimeMs });
      return result;
    }

    let offset = state.offset;
    let consumed = 0;
    let want = this.chunkBytes;
    while (offset < st.size && consumed < this.maxBytesPerPoll) {
      const length = Math.min(want, st.size - offset);
      const chunk = await this.fs.readRange(path, offset, length);
      if (chunk.length === 0) break;
      const lastNl = chunk.lastIndexOf(NL);
      if (lastNl < 0) {
        if (chunk.length >= this.maxLineBytes) {
          // One huge line without newline: skip what we have read and count it.
          offset += chunk.length;
          consumed += chunk.length;
          result.oversizedLines++;
          continue;
        }
        if (chunk.length < length || offset + chunk.length >= st.size) break; // partial line at EOF
        want = Math.min(want * 2, this.maxLineBytes); // line longer than the window: widen it
        continue;
      }
      let lineStart = 0;
      for (let i = 0; i <= lastNl; i++) {
        if (chunk[i] !== NL) continue;
        let end = i;
        if (end > lineStart && chunk[end - 1] === 0x0d) end--;
        if (end - lineStart > this.maxLineBytes) result.oversizedLines++;
        else if (end > lineStart)
          result.lines.push(this.decoder.decode(chunk.subarray(lineStart, end)));
        lineStart = i + 1;
      }
      offset += lastNl + 1;
      consumed += lastNl + 1;
      want = this.chunkBytes;
    }

    result.more = offset < st.size && consumed >= this.maxBytesPerPoll;
    const head = state.head !== '' || offset === 0 ? state.head : await this.readHead(path, offset);
    this.states.set(path, { offset, size: st.size, mtimeMs: st.mtimeMs, head });
    return result;
  }
}

/** `TailFs` over real files (node:fs/promises). */
export const nodeTailFs: TailFs = {
  async stat(path) {
    try {
      const s = await stat(path);
      return s.isFile() ? { size: s.size, mtimeMs: s.mtimeMs } : null;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      throw e;
    }
  },
  async readRange(path, start, length) {
    const handle = await open(path, 'r');
    try {
      const buf = new Uint8Array(length);
      const { bytesRead } = await handle.read(buf, 0, length, start);
      return buf.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  },
};
