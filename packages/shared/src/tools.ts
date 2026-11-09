/**
 * The AI tool layer.
 *
 * Every tool the language model may call is declared here with a Zod schema. The Worker
 * converts these to JSON Schema for the model, and validates every tool call against the
 * same schema before doing anything. Client tools are validated a second time in the
 * browser before they touch the globe. Nothing returned by a model is ever executed as code.
 *
 * Payment safety: no tool can create, approve or capture a payment. `open_take_action`
 * only opens the human review screen; the user must press PayPal's button themselves.
 */
import { z } from 'zod';
import { IsoInstantSchema, ResolutionSchema } from './temporal';
import { EventCategorySchema } from './schemas';

const EventIdArg = z
  .string()
  .min(1)
  .max(160)
  .describe('WorldLens event id, e.g. "hist-battle-of-waterloo"');
const DateArg = IsoInstantSchema.describe(
  'ISO 8601 date, e.g. "1815-06-18" or "1945" or "2026-10-14T09:00:00Z". Earliest navigable year is 1800.',
);

export const LAYERS = [
  'news',
  'history',
  'battles',
  'demo',
  'borders',
  'frontlines',
  'labels',
] as const;
export const LayerSchema = z.enum(LAYERS);
export type LayerId = z.infer<typeof LayerSchema>;

/* ------------------------------------------------------------------ server (data) tools */

export const serverToolSchemas = {
  search_events: z.object({
    query: z
      .string()
      .min(1)
      .max(200)
      .describe('Free-text query: place, topic, conflict, person, organisation'),
    kind: z.enum(['news', 'historical', 'any']).default('any'),
    from: DateArg.optional(),
    to: DateArg.optional(),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  search_history: z.object({
    query: z.string().min(1).max(200),
    from: DateArg.optional(),
    to: DateArg.optional(),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  get_event: z.object({ event_id: EventIdArg }),
  get_event_sources: z.object({ event_id: EventIdArg }),
  get_historical_context: z.object({ event_id: EventIdArg }),
  get_border_at_date: z.object({
    date: DateArg,
    entity: z
      .string()
      .max(120)
      .optional()
      .describe('Optional polity name to look for, e.g. "Germany"'),
  }),
  get_frontline_at_date: z.object({
    date: DateArg,
    conflict_id: z.string().max(120).optional(),
  }),
  compare_dates: z.object({
    date_a: DateArg,
    date_b: DateArg,
    region: z
      .string()
      .max(120)
      .optional()
      .describe('Country or region name to focus the comparison'),
  }),
  compare_frontlines: z.object({
    conflict_id: z.string().max(120),
    date_a: DateArg,
    date_b: DateArg,
  }),
  find_action_options: z.object({
    budget_usd: z.number().positive().max(10_000).optional(),
    event_id: EventIdArg.optional(),
  }),
  get_payment_status: z.object({ payment_id: z.string().min(1).max(80) }),
} as const;

/* ------------------------------------------------------------------ client (globe) tools */

export const clientToolSchemas = {
  fly_to: z
    .object({
      place: z.string().max(120).optional().describe('Place name to resolve (country, city, sea)'),
      lat: z.number().min(-90).max(90).optional(),
      lon: z.number().min(-180).max(180).optional(),
      altitude_km: z.number().min(0.5).max(40_000).optional(),
      label: z.string().max(120).optional(),
    })
    .refine((v) => v.place !== undefined || (v.lat !== undefined && v.lon !== undefined), {
      message: 'Provide either place or both lat and lon',
    }),
  zoom: z.object({
    direction: z.enum(['in', 'out']),
    factor: z
      .number()
      .min(1.2)
      .max(20)
      .optional()
      .describe('How much closer/farther; default 2.5 ("a lot" ≈ 6)'),
  }),
  pan: z.object({
    direction: z.enum([
      'north',
      'south',
      'east',
      'west',
      'northeast',
      'northwest',
      'southeast',
      'southwest',
    ]),
    distance_km: z
      .number()
      .min(1)
      .max(10_000)
      .optional()
      .describe('Default: about half the visible width'),
  }),
  set_time: z.object({ date: DateArg, resolution: ResolutionSchema.optional() }),
  return_to_live: z.object({}),
  highlight_region: z.object({
    country: z
      .string()
      .max(120)
      .describe('Modern country name or ISO 3166-1 alpha-3 code; "none" clears'),
  }),
  show_events: z.object({
    kind: z.enum(['news', 'historical', 'all']).default('all'),
    categories: z.array(EventCategorySchema).max(13).optional(),
  }),
  open_event: z.object({ event_id: EventIdArg }),
  toggle_layer: z.object({ layer: LayerSchema, enabled: z.boolean() }),
  open_take_action: z.object({
    event_id: EventIdArg,
    action_option_id: z.string().max(160),
    amount_usd: z.number().positive().max(10_000).optional(),
  }),
} as const;

export type ServerToolName = keyof typeof serverToolSchemas;
export type ClientToolName = keyof typeof clientToolSchemas;
export type ToolName = ServerToolName | ClientToolName;

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  search_events:
    'Search WorldLens events (current news clusters and historical events). Returns ids, titles, dates, locations. Use before open_event.',
  search_history:
    'Search historical events only (1800 onward). Use for "what happened in X year/place" questions.',
  get_event: 'Get one event with summary, participants, time precision, location and references.',
  get_event_sources:
    "Get the articles and publishers attached to an event, with each publisher's country, ownership type and political-orientation rating (often UNRATED).",
  get_historical_context:
    "Get earlier events linked to an event in the knowledge graph (THEN ↔ NOW). Relations are not necessarily causal; respect each relation's confidence.",
  get_border_at_date:
    'Look up which verified border geometry exists for a date. Returns the snapshot used, its distance from the date, certainty, and whether the named polity appears. If data is unavailable, say so — never invent borders.',
  get_frontline_at_date:
    'Look up verified frontline/control-line geometry for a date. Often unavailable; never invent frontlines.',
  compare_dates:
    'Compare two dates: events in each window and which border snapshots apply. Optionally focus on a region.',
  compare_frontlines:
    'Compare frontline records of one conflict at two dates, if verified data exists.',
  find_action_options:
    'List Take Action options (PayPal SANDBOX demo donations) relevant to humanitarian events, optionally within a budget. Does not move money.',
  get_payment_status:
    'Read the server-verified state of a sandbox payment (from PayPal Orders API). Never claim success unless this returns CAPTURED.',
  fly_to: 'Move the globe camera to a place or coordinates.',
  zoom: 'Zoom the camera in or out from where the user is looking now (keeps the centre).',
  pan: 'Move the camera sideways from where the user is looking now (keeps the altitude).',
  set_time:
    'Move the temporal navigator to a date (enters HISTORICAL MODE). Dates before 1800 are not available yet.',
  return_to_live: 'Return the navigator to LIVE (present time).',
  highlight_region: 'Highlight a modern country outline on the globe ("none" clears).',
  show_events: 'Filter which events are shown on the globe.',
  open_event: 'Open an event card in the context panel and select it on the globe.',
  toggle_layer: 'Turn a globe layer on or off.',
  open_take_action:
    'Open the human review screen for a Take Action option with a suggested amount. The user must review and press PayPal themselves; this tool cannot pay.',
};

export const SERVER_TOOL_NAMES = Object.keys(serverToolSchemas) as ServerToolName[];
export const CLIENT_TOOL_NAMES = Object.keys(clientToolSchemas) as ClientToolName[];

export function isClientTool(name: string): name is ClientToolName {
  return Object.hasOwn(clientToolSchemas, name);
}
export function isServerTool(name: string): name is ServerToolName {
  return Object.hasOwn(serverToolSchemas, name);
}

/** A validated instruction for the browser to apply to the globe. */
export type ClientAction = {
  [K in ClientToolName]: { tool: K; args: z.infer<(typeof clientToolSchemas)[K]> };
}[ClientToolName];

/** Validate an untrusted client action (from the network or a model). */
export function parseClientAction(
  raw: unknown,
): { ok: true; action: ClientAction } | { ok: false; error: string } {
  const envelope = z.object({ tool: z.string(), args: z.unknown() }).safeParse(raw);
  if (!envelope.success) return { ok: false, error: 'Malformed action' };
  const { tool, args } = envelope.data;
  if (!isClientTool(tool)) return { ok: false, error: `Unknown client tool: ${tool}` };
  const parsed = clientToolSchemas[tool].safeParse(args ?? {});
  if (!parsed.success)
    return { ok: false, error: `${tool}: ${parsed.error.issues[0]?.message ?? 'invalid'}` };
  return { ok: true, action: { tool, args: parsed.data } as ClientAction };
}

/** JSON Schema for a tool's input, for the model API. */
export function toolInputJsonSchema(name: ToolName): Record<string, unknown> {
  const schema = isClientTool(name)
    ? clientToolSchemas[name]
    : serverToolSchemas[name as ServerToolName];
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  return json;
}
