# ADR-0007: Stack and repository layout — single npm package, Node 26 LTS, Fastify 5, React 19 + Vite 8, TypeScript 6.0

> **Resumo (pt-BR):** Um único pacote npm (sem workspaces), Node 26 LTS (o que o Carlos já tem), servidor Fastify 5 + WebSocket, front React 19 + Vite 8 com motor Canvas 2D próprio, TypeScript 6.0.3 (o TS 7 ainda não é suportado pelo typescript-eslint), Vitest 5 + Playwright 1.65 usando o Edge instalado, zod 4 para contratos. Poucas dependências, todas fixadas em versão exata. Nada global.

- Status: Proposed
- Date: 2026-11-12
- Deciders: Artur; approval: Carlos

## Context
Windows 11, Node 26.13.1 / npm 11.20.0 installed (Node 26 is the active LTS line since October 2026 [I: by Node's even-release schedule; confirm on nodejs.org at T-02]). Restrictions: no global installs, few dependencies, low CPU, offline, security. Team: Lívia (React), Bruno (Node backend). Versions checked on the npm registry on 2026-11-12 [F].

## Decision
| Area | Choice (exact pin) | Notes |
|---|---|---|
| Runtime | Node `>=26.0 <27` (`.nvmrc` = 26) | `engines` + `engine-strict` in `.npmrc` |
| Server | `fastify@5.12.8`, `@fastify/websocket@11.3.7`, `@fastify/static@10.1.10`, `@fastify/cookie@11.1.5`, `@fastify/rate-limit@11.2.2` | pino logger built in; no `@fastify/cors` |
| Contracts/validation | `zod@4.6.7` | shared server/web; JSON Schemas generated with `z.toJSONSchema` into `schemas/` |
| PTY | `@lydell/node-pty@1.2.0-beta.18` **or** `node-pty@1.1.0` | chosen by spike S-01 (prebuilt N-API preferred: no compiler) |
| Web | `react@19.3.1`, `react-dom@19.3.1`, `vite@8.3.8`, `@vitejs/plugin-react@6.3.0` | no state library (own store + `useSyncExternalStore`), no UI kit |
| Render | own Canvas 2D engine (ADR-0002) | PixiJS 8.23.0 only if S-02 says so |
| Terminal | `@xterm/xterm@6.0.0`, `@xterm/addon-fit@0.11.0` | phase 2 |
| Markdown (chat) | `marked@18.2.0` + `dompurify@3.4.17` | HTML disabled in marked, then sanitized |
| Styling | plain CSS + CSS custom properties from `docs/design/tokens.css` (Bianca) | no Tailwind: one screen, few components; `tailwind.theme.cjs` kept only as a reference. Revisit (new ADR) if the HUD grows |
| i18n | own tiny typed module (JSON dictionaries, ICU-less plurals via `Intl.PluralRules`) | avoids i18next; parity test (CA-10) |
| Files | `node:fs` `watch` (recursive) + debounce | no chokidar |
| Language | `typescript@6.0.3` | `typescript-eslint@8.72.2` supports `<6.1`; TS 7 later via new ADR |
| Lint/format | `eslint@10.14.0`, `typescript-eslint@8.72.2`, `prettier@3.10.1` | |
| Tests | `vitest@5.1.0`, `@playwright/test@1.65.0` with `channel: 'msedge'` | no browser download (uses installed Edge) |
| Dev runner | `tsx@4.23.15` | `tsx watch` for server |
| Server bundle | `esbuild@0.28.2` | single `dist/server/index.js` |

Layout: one `package.json`, sources under `src/{shared,server,web,hook-runtime}`; see `docs/ARQUITETURA.md` §3. Dev mode does **not** use the Vite dev server on another port (it would break the Host/Origin model): `npm run dev` runs `vite build --watch` + `tsx watch src/server/main.ts`; the server serves `dist/web` on 3200.

## Alternatives considered
- **npm workspaces (Pixel Agents style).** Useful for publishing multiple packages; we publish none. Rejected for simplicity.
- **Next.js.** SSR/routing not needed; heavier; conflicts with the strict local server. Rejected.
- **NestJS backend.** Bruno knows it, but DI/framework weight is unjustified for ~25 routes + WS. Rejected.
- **TypeScript 7 (native compiler).** Faster, but typescript-eslint does not support it yet [F]. Revisit.
- **Vite dev server + proxy.** HMR convenience vs. a second port and relaxed Origin rules. Rejected.

## Consequences
- (+) ~15 runtime/dev dependencies, all MIT/BSD/Apache (Sérgio runs SCA at each gate); offline; no global installs.
- (−) No HMR in dev (full reload after rebuild, ~1–2 s).
- (−) `node_modules` inside OneDrive (slow sync, many files). Mitigation options for Carlos: keep as is, or mark the folder "Always keep on this device"/pause sync while installing. Runtime data is outside OneDrive anyway.
