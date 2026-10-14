/**
 * Knowledge-graph edges (THEN ↔ NOW). Semantics: `from` TYPE `to`.
 *   PRECEDED_BY  – `to` happened earlier and is relevant context. Not a causal claim.
 *   LED_TO       – reserved for well-established causal links (used sparingly).
 *   ESCALATION_OF / RESPONSE_TO / PART_OF / PEACE_AGREEMENT / TERRITORIAL_CHANGE / RELATED_TO.
 * Confidence reflects how standard the connection is in reference works, not certainty of history.
 */
import type { EventRelation } from '../schemas';

const CURATED = 'WorldLens curated (editorial link; see the linked Wikipedia articles)';

function r(
  fromId: string,
  type: EventRelation['type'],
  toId: string,
  confidence: number,
  notes?: string,
  source = CURATED,
): EventRelation {
  return { fromId, toId, type, confidence, source, ...(notes ? { notes } : {}) };
}

export const RELATIONS: EventRelation[] = [
  // Cross-strait context (demo current event → history)
  r('demo-news-taiwan-strait-drills', 'RELATED_TO', 'hist-taiwan-exercises-2022', 0.8, 'Same type of activity in the same area.'),
  r('demo-news-taiwan-strait-drills', 'PRECEDED_BY', 'hist-third-taiwan-strait-crisis', 0.7, 'Earlier period of missile tests and exercises near Taiwan.'),
  r('demo-news-taiwan-strait-drills', 'PRECEDED_BY', 'hist-second-taiwan-strait-crisis', 0.6),
  r('demo-news-taiwan-strait-drills', 'PRECEDED_BY', 'hist-first-taiwan-strait-crisis', 0.6),
  r('demo-news-taiwan-strait-drills', 'RELATED_TO', 'hist-roc-retreat-to-taiwan', 0.7, 'Origin of separate governance across the Strait.'),
  r('demo-news-taiwan-strait-drills', 'RELATED_TO', 'hist-treaty-of-san-francisco', 0.5, "Frequently cited in debates about Taiwan's status."),
  r('demo-news-taiwan-strait-drills', 'RELATED_TO', 'hist-treaty-of-shimonoseki', 0.4, 'Taiwan was ceded to Japan in 1895.'),
  r('hist-taiwan-exercises-2022', 'PRECEDED_BY', 'hist-third-taiwan-strait-crisis', 0.7),
  r('hist-third-taiwan-strait-crisis', 'PRECEDED_BY', 'hist-second-taiwan-strait-crisis', 0.6),
  r('hist-second-taiwan-strait-crisis', 'PRECEDED_BY', 'hist-first-taiwan-strait-crisis', 0.7),
  r('hist-first-taiwan-strait-crisis', 'PRECEDED_BY', 'hist-roc-retreat-to-taiwan', 0.8),
  r('hist-roc-retreat-to-taiwan', 'RELATED_TO', 'hist-prc-proclaimed', 0.9),
  // South China Sea
  r('demo-news-scs-shoal-standoff', 'RELATED_TO', 'hist-south-china-sea-arbitration', 0.8, 'The 2016 award addressed maritime entitlements in the area.'),
  r('demo-news-scs-shoal-standoff', 'PRECEDED_BY', 'hist-scarborough-shoal-standoff-2012', 0.8, 'Earlier standoff at the same shoal.'),
  r('demo-news-scs-shoal-standoff', 'PRECEDED_BY', 'hist-johnson-south-reef-skirmish', 0.5),
  r('demo-news-scs-shoal-standoff', 'PRECEDED_BY', 'hist-battle-of-paracel-islands', 0.5),
  r('hist-south-china-sea-arbitration', 'PRECEDED_BY', 'hist-scarborough-shoal-standoff-2012', 0.7, 'The Philippines began proceedings in January 2013, after the standoff.'),
  r('hist-scarborough-shoal-standoff-2012', 'PRECEDED_BY', 'hist-johnson-south-reef-skirmish', 0.4),
  r('hist-johnson-south-reef-skirmish', 'PRECEDED_BY', 'hist-battle-of-paracel-islands', 0.5),
  r('hist-treaty-of-paris-1898', 'RELATED_TO', 'hist-south-china-sea-arbitration', 0.2, 'Historical sovereignty context for the Philippines.'),
  // Germany 1933–1945 territorial sequence
  r('hist-saar-referendum-1935', 'PRECEDED_BY', 'hist-hitler-chancellor', 0.8),
  r('hist-rhineland-remilitarization', 'PRECEDED_BY', 'hist-saar-referendum-1935', 0.6),
  r('hist-anschluss', 'PRECEDED_BY', 'hist-rhineland-remilitarization', 0.6),
  r('hist-munich-agreement', 'PRECEDED_BY', 'hist-anschluss', 0.8),
  r('hist-occupation-czechoslovakia', 'ESCALATION_OF', 'hist-munich-agreement', 0.8, 'Germany occupied the rest of the Czech lands in breach of the agreement.'),
  r('hist-memel-1939', 'PRECEDED_BY', 'hist-occupation-czechoslovakia', 0.7),
  r('hist-invasion-of-poland', 'PRECEDED_BY', 'hist-memel-1939', 0.6),
  r('hist-battle-of-berlin', 'PART_OF', 'hist-invasion-of-poland', 0.3, 'Both part of the Second World War in Europe.'),
  r('hist-german-surrender-1945', 'PRECEDED_BY', 'hist-battle-of-berlin', 0.9),
  r('hist-berlin-declaration-1945', 'PRECEDED_BY', 'hist-german-surrender-1945', 0.9),
  r('hist-hitler-chancellor', 'RELATED_TO', 'hist-treaty-of-versailles', 0.5, 'The treaty’s terms were a major grievance exploited in interwar German politics.'),
  // First World War
  r('hist-armistice-1918', 'PRECEDED_BY', 'hist-assassination-franz-ferdinand', 0.7),
  r('hist-treaty-of-versailles', 'PEACE_AGREEMENT', 'hist-armistice-1918', 0.9),
  // Cold War Berlin
  r('hist-berlin-wall-built', 'PRECEDED_BY', 'hist-berlin-declaration-1945', 0.6),
  r('hist-fall-of-berlin-wall', 'PRECEDED_BY', 'hist-berlin-wall-built', 0.9),
  r('hist-german-reunification', 'PRECEDED_BY', 'hist-fall-of-berlin-wall', 0.9),
  r('hist-german-reunification', 'TERRITORIAL_CHANGE', 'hist-berlin-declaration-1945', 0.6, 'Ended the post-war division that began with Allied occupation.'),
  // Korea
  r('hist-korean-war', 'PRECEDED_BY', 'hist-division-of-korea', 0.9),
  r('hist-korean-armistice', 'PEACE_AGREEMENT', 'hist-korean-war', 0.9, 'An armistice, not a peace treaty.'),
  r('hist-division-of-korea', 'PRECEDED_BY', 'hist-japan-annexes-korea', 0.6),
  // Ukraine
  r('hist-russian-invasion-of-ukraine-2022', 'ESCALATION_OF', 'hist-annexation-of-crimea-2014', 0.8, 'Both are phases of the Russo-Ukrainian War that began in 2014.'),
  r('hist-annexation-of-crimea-2014', 'PRECEDED_BY', 'hist-dissolution-of-ussr', 0.6, 'Crimea was part of independent Ukraine from 1991.'),
  // Napoleonic
  r('hist-battle-of-waterloo', 'PRECEDED_BY', 'hist-battle-of-leipzig', 0.7),
  r('hist-battle-of-leipzig', 'PRECEDED_BY', 'hist-french-invasion-of-russia', 0.8),
  r('hist-battle-of-borodino', 'PART_OF', 'hist-french-invasion-of-russia', 0.95),
  r('hist-congress-of-vienna', 'RELATED_TO', 'hist-battle-of-waterloo', 0.8, 'The Final Act was signed nine days before Waterloo.'),
  // Indonesia
  r('hist-indonesian-mass-killings-1965', 'PRECEDED_BY', 'hist-30-september-movement', 0.9),
  r('hist-30-september-movement', 'PRECEDED_BY', 'hist-indonesian-independence', 0.3),
  // Disasters (regional context for demo relief scenarios)
  r('demo-news-sulawesi-quake-relief', 'RELATED_TO', 'hist-2004-indian-ocean-tsunami', 0.4, 'Earlier major earthquake disaster in Indonesia.'),
  r('demo-news-sulawesi-quake-relief', 'RELATED_TO', 'hist-krakatoa-1883', 0.2, 'Indonesia lies on the Pacific "Ring of Fire".'),
  // Hong Kong
  r('hist-hong-kong-handover', 'TERRITORIAL_CHANGE', 'hist-treaty-of-nanking', 0.7, 'Hong Kong Island had been ceded to Britain in 1842.'),
  // Suez
  r('hist-suez-crisis', 'RELATED_TO', 'hist-suez-canal-opening', 0.5),
];
