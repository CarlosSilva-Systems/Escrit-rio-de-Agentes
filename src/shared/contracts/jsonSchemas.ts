import { z } from 'zod';
import { EscritorioSchema } from './escritorio';
import { OfficeEventSchema } from './events';
import { HookPayloadSchema } from './hooks';
import { MapaSchema } from './mapa';
import * as rest from './rest';
import { OfficeSnapshotSchema } from './state';
import { UsoSchema } from './uso';
import { ClientMessageSchema, ServerEnvelopeSchema, TerminalClientMessageSchema } from './ws';

// Pure builder of the JSON Schema documents (written to schemas/ by scripts/gen-schemas.mjs).
// `io: 'input'` because these are authored/received documents: fields with defaults are optional.

type JsonObject = Record<string, unknown>;

function convert(schema: z.ZodType): JsonObject {
  const { $schema: _ignored, ...body } = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'any',
  }) as JsonObject;
  return body;
}

function document(name: string, title: string, body: JsonObject): JsonObject {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://escritorio-equipe.local/schemas/${name}.schema.json`,
    title,
    ...body,
  };
}

function bundle(name: string, title: string, defs: Record<string, z.ZodType>): JsonObject {
  const $defs: JsonObject = {};
  for (const [key, schema] of Object.entries(defs)) $defs[key] = convert(schema);
  return document(name, title, { $defs });
}

/** File name (without directory) to JSON-serializable document. */
export function buildJsonSchemas(): Record<string, JsonObject> {
  return {
    'escritorio.v1.schema.json': document(
      'escritorio.v1',
      'escritorio.json (escritorio/v1)',
      convert(EscritorioSchema),
    ),
    'mapa.v1.schema.json': document('mapa.v1', 'mapa.json (mapa/v1)', convert(MapaSchema)),
    'uso.v1.schema.json': document('uso.v1', 'uso.json (uso/v1)', convert(UsoSchema)),
    'events.v1.schema.json': bundle('events.v1', 'Office events, state and WebSocket (v1)', {
      HookPayload: HookPayloadSchema,
      OfficeEvent: OfficeEventSchema,
      OfficeSnapshot: OfficeSnapshotSchema,
      ServerEnvelope: ServerEnvelopeSchema,
      ClientMessage: ClientMessageSchema,
      TerminalClientMessage: TerminalClientMessageSchema,
    }),
    'rest.v1.schema.json': bundle('rest.v1', 'REST request/response bodies (v1)', {
      AuthTicketResponse: rest.AuthTicketResponseSchema,
      HealthResponse: rest.HealthResponseSchema,
      SessionResponse: rest.SessionResponseSchema,
      ConfigPatch: rest.ConfigPatchSchema,
      ProjectCreateRequest: rest.ProjectCreateRequestSchema,
      ProjectSessionsResponse: rest.ProjectSessionsResponseSchema,
      ChatSessionCreateRequest: rest.ChatSessionCreateRequestSchema,
      ChatMessageRequest: rest.ChatMessageRequestSchema,
      TerminalInputRequest: rest.TerminalInputRequestSchema,
      ApprovalDecisionRequest: rest.ApprovalDecisionRequestSchema,
      ApprovalDetailsResponse: rest.ApprovalDetailsResponseSchema,
      NpcHistoryResponse: rest.NpcHistoryResponseSchema,
      TokensQuery: rest.TokensQuerySchema,
    }),
  };
}

/** Deterministic serialization used both to write and to verify the generated files. */
export function serializeSchema(doc: JsonObject): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
