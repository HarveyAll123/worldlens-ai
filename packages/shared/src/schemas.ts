/**
 * Runtime schemas shared by the browser and the Worker.
 * Every record that crosses a trust boundary (network, database, LLM) is parsed with these.
 */
import { z } from 'zod';
import { IsoInstantSchema, TemporalSchema } from './temporal';

/* ------------------------------------------------------------------ primitives */

export const LatSchema = z.number().min(-90).max(90);
export const LonSchema = z.number().min(-180).max(180);

/** Only https URLs (or http for localhost in development) are accepted from any provider. */
export const SafeUrlSchema = z
  .string()
  .max(2048)
  .refine((v) => {
    try {
      const u = new URL(v);
      if (u.protocol === 'https:') return true;
      return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
    } catch {
      return false;
    }
  }, 'Expected an https URL');

export const IdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9:_.-]+$/, 'Invalid id');

/* ------------------------------------------------------------------ media & citations */

export const MediaAssetSchema = z.object({
  url: SafeUrlSchema,
  /** Where a human can see the original (file page, article). */
  sourcePageUrl: SafeUrlSchema.optional(),
  credit: z.string().max(300),
  license: z.string().max(120),
  licenseUrl: SafeUrlSchema.optional(),
  source: z.string().max(120),
  /** False unless the license allows WorldLens to store a copy. Default: hotlink only. */
  cachingPermitted: z.boolean().default(false),
  alt: z.string().max(300).optional(),
});
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const CitationSchema = z.object({
  title: z.string().max(300),
  url: SafeUrlSchema,
  publisher: z.string().max(160),
  kind: z.enum(['encyclopedia', 'primary', 'dataset', 'news', 'scholarly', 'government', 'other']),
  accessed: z.string().optional(),
  license: z.string().max(120).optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

/* ------------------------------------------------------------------ locations */

export const LocationPrecisionSchema = z.enum([
  'exact',
  'city',
  'region',
  'country',
  'approximate',
]);

export const LocationSchema = z.object({
  name: z.string().max(200),
  lat: LatSchema,
  lon: LonSchema,
  precision: LocationPrecisionSchema,
  /** ISO 3166-1 alpha-3 where known (modern country containing the point). */
  countryCode: z.string().length(3).optional(),
  confidence: z.number().min(0).max(1).default(1),
});
export type EventLocation = z.infer<typeof LocationSchema>;

/* ------------------------------------------------------------------ events */

export const EVENT_CATEGORIES = [
  'conflict',
  'military',
  'diplomacy',
  'politics',
  'protest',
  'disaster',
  'humanitarian',
  'economy',
  'science',
  'health',
  'territorial',
  'society',
  'other',
] as const;
export const EventCategorySchema = z.enum(EVENT_CATEGORIES);
export type EventCategory = z.infer<typeof EventCategorySchema>;

export const ParticipantSchema = z.object({
  name: z.string().max(200),
  type: z.enum(['country', 'state', 'organization', 'person', 'group', 'other']),
  role: z.string().max(120).optional(),
});
export type Participant = z.infer<typeof ParticipantSchema>;

export const EventKindSchema = z.enum(['news', 'historical']);
export type EventKind = z.infer<typeof EventKindSchema>;

export const ProvenanceSchema = z.object({
  provider: z.enum(['demo', 'curated', 'gdelt', 'wikipedia', 'wikidata', 'manual', 'database']),
  note: z.string().max(400).optional(),
  retrievedAt: z.string().optional(),
});

export const EventSchema = z.object({
  id: IdSchema,
  kind: EventKindSchema,
  /** True for synthetic demo scenarios. These are ALWAYS labelled DEMO in the UI. */
  isDemo: z.boolean(),
  title: z.string().min(1).max(300),
  summary: z.string().max(1200).optional(),
  whyItMatters: z.string().max(800).optional(),
  category: EventCategorySchema,
  tags: z.array(z.string().max(60)).max(30).default([]),
  time: TemporalSchema,
  location: LocationSchema,
  extraLocations: z.array(LocationSchema).max(10).default([]),
  participants: z.array(ParticipantSchema).max(30).default([]),
  image: MediaAssetSchema.optional(),
  wikipediaTitle: z.string().max(300).optional(),
  references: z.array(CitationSchema).max(20).default([]),
  /** 1 (minor) – 5 (world-historical). Used for level-of-detail filtering. */
  importance: z.number().int().min(1).max(5).default(3),
  /** Confidence of clustering + location resolution for derived events; 1 for curated. */
  confidence: z.number().min(0).max(1).default(1),
  conflictId: IdSchema.optional(),
  articleCount: z.number().int().min(0).default(0),
  sourceCount: z.number().int().min(0).default(0),
  hasTakeAction: z.boolean().default(false),
  provenance: ProvenanceSchema,
  updatedAt: z.string().optional(),
});
export type WorldEvent = z.infer<typeof EventSchema>;

/** Compact marker payload for the globe (keeps list responses small). */
export const EventSummarySchema = EventSchema.pick({
  id: true,
  kind: true,
  isDemo: true,
  title: true,
  category: true,
  time: true,
  location: true,
  importance: true,
  confidence: true,
  articleCount: true,
  sourceCount: true,
  hasTakeAction: true,
});
export type EventSummary = z.infer<typeof EventSummarySchema>;

/* ------------------------------------------------------------------ sources & perspectives */

export const POLITICAL_RATINGS = [
  'LEFT',
  'CENTER-LEFT',
  'CENTER',
  'CENTER-RIGHT',
  'RIGHT',
  'MIXED',
  'UNRATED',
] as const;
export const PoliticalRatingValueSchema = z.enum(POLITICAL_RATINGS);
export type PoliticalRatingValue = z.infer<typeof PoliticalRatingValueSchema>;

/**
 * A rating is only defensible with methodology, source, confidence and review date.
 * Anything else must be UNRATED.
 */
export const PoliticalRatingSchema = z
  .object({
    value: PoliticalRatingValueSchema,
    methodology: z.string().max(600).nullable(),
    source: z.string().max(200).nullable(),
    sourceUrl: SafeUrlSchema.nullable().optional(),
    confidence: z.enum(['low', 'medium', 'high']).nullable(),
    lastReviewed: z.string().nullable(),
    illustrative: z.boolean().default(false),
  })
  .superRefine((r, ctx) => {
    if (r.value === 'UNRATED') return;
    for (const key of ['methodology', 'source', 'confidence', 'lastReviewed'] as const) {
      if (!r[key]) {
        ctx.addIssue({
          code: 'custom',
          message: `A ${r.value} rating requires ${key}; otherwise use UNRATED`,
          path: [key],
        });
      }
    }
  });
export type PoliticalRating = z.infer<typeof PoliticalRatingSchema>;

export const UNRATED: PoliticalRating = {
  value: 'UNRATED',
  methodology: null,
  source: null,
  sourceUrl: null,
  confidence: null,
  lastReviewed: null,
  illustrative: false,
};

export const SOURCE_TYPES = [
  'wire-agency',
  'public-broadcaster',
  'state-media',
  'commercial',
  'nonprofit',
  'reader-funded',
  'local',
  'government',
  'demo-fictional',
  'unknown',
] as const;
export const SourceTypeSchema = z.enum(SOURCE_TYPES);

export const NewsSourceSchema = z.object({
  id: IdSchema,
  name: z.string().max(160),
  domain: z.string().max(160),
  /** ISO 3166-1 alpha-2 country of the publisher (not of the event). */
  country: z.string().length(2).nullable(),
  sourceType: SourceTypeSchema,
  ownership: z.string().max(300).nullable(),
  /** National perspective, e.g. "Taiwan", "China (PRC)". Often more useful than left/right. */
  nationalPerspective: z.string().max(80).nullable(),
  rating: PoliticalRatingSchema,
  isDemo: z.boolean().default(false),
});
export type NewsSource = z.infer<typeof NewsSourceSchema>;

export const ArticleSchema = z.object({
  id: IdSchema,
  sourceId: IdSchema,
  headline: z.string().min(1).max(400),
  url: SafeUrlSchema,
  publishedAt: z.string(),
  language: z.string().max(40).nullable(),
  sourceCountry: z.string().max(80).nullable(),
  /** Short lede/snippet the provider gave us (never the full article). */
  snippet: z.string().max(600).optional(),
  imageUrl: SafeUrlSchema.optional(),
  isDemo: z.boolean().default(false),
});
export type Article = z.infer<typeof ArticleSchema>;

/* ------------------------------------------------------------------ relations */

export const RELATION_TYPES = [
  'PRECEDED_BY',
  'LED_TO',
  'PART_OF',
  'RELATED_TO',
  'RESPONSE_TO',
  'ESCALATION_OF',
  'TERRITORIAL_CHANGE',
  'PEACE_AGREEMENT',
] as const;
export const RelationTypeSchema = z.enum(RELATION_TYPES);

export const EventRelationSchema = z.object({
  fromId: IdSchema,
  toId: IdSchema,
  type: RelationTypeSchema,
  confidence: z.number().min(0).max(1),
  source: z.string().max(300),
  notes: z.string().max(600).optional(),
});
export type EventRelation = z.infer<typeof EventRelationSchema>;

/* ------------------------------------------------------------------ geometry */

const Position = z.tuple([LonSchema, LatSchema]).rest(z.number());
const Ring = z.array(Position).min(4);
export const PolygonSchema = z.object({ type: z.literal('Polygon'), coordinates: z.array(Ring) });
export const MultiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(Ring)),
});
export const LineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(Position).min(2),
});
export const MultiLineStringSchema = z.object({
  type: z.literal('MultiLineString'),
  coordinates: z.array(z.array(Position).min(2)),
});
export type PolygonGeometry = z.infer<typeof PolygonSchema> | z.infer<typeof MultiPolygonSchema>;
export type LineGeometry = z.infer<typeof LineStringSchema> | z.infer<typeof MultiLineStringSchema>;

export const CERTAINTY = ['CERTAIN', 'APPROXIMATE', 'DISPUTED', 'RECONSTRUCTED'] as const;
export const CertaintySchema = z.enum(CERTAINTY);
export type Certainty = z.infer<typeof CertaintySchema>;

export const ENTITY_TYPES = [
  'state',
  'empire',
  'kingdom',
  'republic',
  'colony',
  'protectorate',
  'occupation-zone',
  'disputed-region',
  'control-zone',
  'cultural-region',
  'other',
] as const;

export const HistoricalGeometrySchema = z.object({
  id: IdSchema,
  entityId: IdSchema,
  entityName: z.string().max(200),
  entityType: z.enum(ENTITY_TYPES),
  geometry: z.union([PolygonSchema, MultiPolygonSchema]),
  validFrom: IsoInstantSchema,
  validTo: IsoInstantSchema.nullable(),
  datePrecision: z.enum(['day', 'month', 'year', 'decade', 'snapshot']),
  geometryPrecision: z.enum(['world-scale', 'regional', 'survey-grade']),
  certainty: CertaintySchema,
  status: z.string().max(120),
  disputed: z.boolean(),
  source: z.string().max(200),
  license: z.string().max(120),
  citation: z.string().max(400),
});
export type HistoricalGeometry = z.infer<typeof HistoricalGeometrySchema>;

export const FrontlineSchema = z.object({
  id: IdSchema,
  conflictId: IdSchema,
  name: z.string().max(200),
  geometry: z.union([LineStringSchema, MultiLineStringSchema]),
  validFrom: IsoInstantSchema,
  validTo: IsoInstantSchema.nullable(),
  datePrecision: z.enum(['day', 'month', 'year']),
  certainty: CertaintySchema,
  sideA: z.string().max(120),
  sideB: z.string().max(120),
  disputed: z.boolean(),
  confidence: z.number().min(0).max(1),
  source: z.string().max(300),
  license: z.string().max(120),
  notes: z.string().max(600).optional(),
});
export type Frontline = z.infer<typeof FrontlineSchema>;

/* ------------------------------------------------------------------ take action / payments */

export const ActionOptionSchema = z.object({
  id: IdSchema,
  /** Demo events this option is attached to. */
  eventIds: z.array(IdSchema),
  /**
   * Live (non-demo) event categories for which this sandbox option may be offered.
   * Such offers are still SANDBOX demos and are labelled as not reaching any real cause.
   */
  appliesToLiveCategories: z.array(EventCategorySchema).default([]),
  title: z.string().max(160),
  description: z.string().max(600),
  purpose: z.string().max(200),
  beneficiary: z.object({
    name: z.string().max(160),
    kind: z.literal('sandbox-demo-merchant'),
    disclosure: z.string().max(400),
  }),
  currency: z.literal('USD'),
  suggestedAmounts: z.array(z.number().positive()).min(1).max(6),
  minAmount: z.number().positive(),
  maxAmount: z.number().positive(),
  /** Real organisations listed for information only — never payment recipients here. */
  informationalLinks: z
    .array(z.object({ name: z.string().max(160), url: SafeUrlSchema, note: z.string().max(200) }))
    .max(6)
    .default([]),
  sandbox: z.literal(true),
});
export type ActionOption = z.infer<typeof ActionOptionSchema>;

export const PAYMENT_STATES = [
  'REVIEW',
  'CREATED',
  'APPROVED',
  'CAPTURED',
  'PENDING',
  'DECLINED',
  'CANCELLED',
  'FAILED',
  'REFUNDED',
] as const;
export const PaymentStateSchema = z.enum(PAYMENT_STATES);
export type PaymentState = z.infer<typeof PaymentStateSchema>;

/** Money as a decimal string, as PayPal expects ("20.00"). */
export const MoneyValueSchema = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/);

export const CreatePaymentRequestSchema = z.object({
  actionOptionId: IdSchema,
  eventId: IdSchema,
  amount: MoneyValueSchema,
  currency: z.literal('USD'),
  /** The browser must echo the exact terms the user reviewed. */
  reviewedTerms: z.object({
    beneficiary: z.string().max(160),
    purpose: z.string().max(200),
    sandboxAcknowledged: z.literal(true),
  }),
});
export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;

export const PaymentRecordSchema = z.object({
  id: z.string(),
  paypalOrderId: z.string().nullable(),
  actionOptionId: z.string(),
  eventId: z.string(),
  amount: MoneyValueSchema,
  currency: z.string(),
  state: PaymentStateSchema,
  environment: z.enum(['sandbox', 'live']),
  captureId: z.string().nullable(),
  paypalStatus: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastError: z.string().nullable(),
});
export type PaymentRecord = z.infer<typeof PaymentRecordSchema>;

/* ------------------------------------------------------------------ search */

export const SearchResultTypeSchema = z.enum(['NEWS', 'HISTORY', 'PLACE', 'ENTITY', 'CONFLICT']);
export type SearchResultType = z.infer<typeof SearchResultTypeSchema>;

export const SearchResultSchema = z.object({
  type: SearchResultTypeSchema,
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  lat: LatSchema.optional(),
  lon: LonSchema.optional(),
  /** Altitude suggestion in metres for fly-to. */
  altitude: z.number().positive().optional(),
  time: TemporalSchema.optional(),
  eventId: z.string().optional(),
  isDemo: z.boolean().default(false),
  score: z.number(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

/* ------------------------------------------------------------------ framing */

export const StatementKindSchema = z.enum(['fact', 'claim', 'allegation', 'assessment']);
export const FramingSchema = z.object({
  eventId: z.string(),
  method: z.enum(['ai', 'heuristic']),
  model: z.string().optional(),
  /** Topics/terms several outlets share (descriptive only — not a factual claim). */
  sharedTopics: z.array(z.string()).optional(),
  commonlyReported: z.array(
    z.object({ text: z.string(), kind: StatementKindSchema, sourceIds: z.array(z.string()) }),
  ),
  disagreements: z.array(
    z.object({
      topic: z.string(),
      positions: z.array(z.object({ text: z.string(), sourceIds: z.array(z.string()) })),
    }),
  ),
  framingDifferences: z.array(z.object({ sourceId: z.string(), framing: z.string() })),
  caveats: z.array(z.string()),
  generatedAt: z.string(),
});
export type Framing = z.infer<typeof FramingSchema>;
