import { AuthTicketResponseSchema, HealthResponseSchema } from '../shared/contracts';

/**
 * Local HTTP client of the CLI. Always talks to 127.0.0.1 with the master token in an
 * `Authorization` header (never argv, never URL, never env of a child process) and never sends an
 * `Origin` header (Node's fetch does not add one).
 */

const baseUrl = (port: number) => `http://127.0.0.1:${port}`;

export async function checkHealth(
  port: number,
  token: string,
  timeoutMs = 1500,
): Promise<{ version: string } | null> {
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
