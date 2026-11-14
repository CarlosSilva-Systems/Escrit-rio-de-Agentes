import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  AuthTicketResponseSchema,
  HealthProofResponseSchema,
  HealthResponseSchema,
} from '../shared/contracts';
import { proofOf } from '../server/home/tokens';

/**
 * Local HTTP client of the CLI. Always talks to 127.0.0.1 with the master token in an
 * `Authorization` header (never argv, never URL, never env of a child process) and never sends an
 * `Origin` header (Node's fetch does not add one).
 */

const baseUrl = (port: number) => `http://127.0.0.1:${port}`;

/**
 * Identity challenge (M2): the master token is only sent to a process that proves it knows it.
 * A squatter on the port cannot compute HMAC(token, nonce), so it never receives the credential.
 * The comparison is constant-time.
 */
export async function verifyServer(
  port: number,
  token: string,
  timeoutMs = 1500,
): Promise<boolean> {
  try {
    const nonce = randomBytes(24).toString('base64url');
    const res = await fetch(`${baseUrl(port)}/api/health/proof?n=${nonce}&k=master`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    });
    if (res.status !== 200) return false;
    const parsed = HealthProofResponseSchema.safeParse(await res.json());
    if (!parsed.success) return false;
    const got = Buffer.from(parsed.data.proof, 'hex');
    const want = Buffer.from(proofOf(token, nonce), 'hex');
    return got.length === want.length && timingSafeEqual(got, want);
  } catch {
    return false;
  }
}

export async function checkHealth(
  port: number,
  token: string,
  timeoutMs = 1500,
): Promise<{ version: string } | null> {
  if (!(await verifyServer(port, token, timeoutMs))) return null;
  try {
    const res = await fetch(`${baseUrl(port)}/api/health`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    });
    if (res.status !== 200) return null;
    const parsed = HealthResponseSchema.safeParse(await res.json());
    return parsed.success ? { version: parsed.data.version } : null;
  } catch {
    return null;
  }
}

export type TicketResult = { ok: true; ticket: string } | { ok: false; status: number };

export async function requestTicket(port: number, token: string): Promise<TicketResult> {
  if (!(await verifyServer(port, token))) return { ok: false, status: 0 };
  try {
    const res = await fetch(`${baseUrl(port)}/api/auth/ticket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
    });
    if (res.status !== 200) return { ok: false, status: res.status };
    const parsed = AuthTicketResponseSchema.safeParse(await res.json());
    return parsed.success ? { ok: true, ticket: parsed.data.ticket } : { ok: false, status: 502 };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function requestShutdown(port: number, token: string): Promise<boolean> {
  if (!(await verifyServer(port, token))) return false;
  try {
    const res = await fetch(`${baseUrl(port)}/api/admin/shutdown`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
    });
    return res.status === 202;
  } catch {
    return false;
  }
}
