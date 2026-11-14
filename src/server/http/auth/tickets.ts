import { createHash, randomBytes } from 'node:crypto';

export const TICKET_TTL_SEC = 60;
const MAX_PENDING = 32;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Single-use access tickets (ADR-0005): 128 random bits, 60 s, kept in memory as SHA-256
 * digests. `consume` removes the ticket whether or not it is still valid.
 */
export class TicketStore {
  private readonly pending = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  issue(): { ticket: string; expiresInSec: number } {
    this.purge();
    // Bounded: drop the oldest tickets if somebody keeps asking.
    while (this.pending.size >= MAX_PENDING) {
      const oldest = this.pending.keys().next().value;
      if (oldest === undefined) break;
      this.pending.delete(oldest);
    }
    const ticket = randomBytes(16).toString('base64url');
    this.pending.set(sha256(ticket), this.now() + TICKET_TTL_SEC * 1000);
    return { ticket, expiresInSec: TICKET_TTL_SEC };
  }

  consume(ticket: string): boolean {
    const key = sha256(ticket);
    const expiresAt = this.pending.get(key);
    if (expiresAt === undefined) return false;
    this.pending.delete(key);
    return expiresAt > this.now();
  }

  clear(): void {
    this.pending.clear();
  }

  private purge(): void {
    const t = this.now();
    for (const [key, expiresAt] of this.pending) if (expiresAt <= t) this.pending.delete(key);
  }
}
