import type { TheatreSource } from './types';

/**
 * Occupied France and the Low Countries between the armistice (25 June 1940) and the Normandy
 * landings (6 June 1944). Side A is Germany. Until 11 November 1942 the line is the
 * demarcation line between the occupied zone and the "free zone" governed from Vichy; that
 * day German and Italian troops occupied the free zone too (Case Anton), and the line goes.
 */
export const WW2_OCCUPIED_FRANCE: TheatreSource = {
  id: 'ww2-occupied-france',
  name: 'Demarcation line (occupied zone / Vichy free zone)',
  war: 'World War II',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Germany (occupied zone; from November 1942, with Italy, all of France)',
  sideB: 'Vichy France (free zone)',
  start: '1940-06-25',
  end: '1944-06-06',
  horizonDays: 3,
  maxEdgeKm: 420,
  colorA: 'germany',
  colorB: 'france',
  politiesA: '^(german reich|germany-luxembourg)',
  politiesB:
    '^(french state|french republic|france|belgium|military administration in belgium|kingdom of the netherlands|luxembourg)',
  sources: [
    'https://www.data.gouv.fr/datasets/ligne-de-demarcation',
    'https://en.wikipedia.org/wiki/Demarcation_line_(France)',
    'https://en.wikipedia.org/wiki/Zone_libre',
    'https://en.wikipedia.org/wiki/Case_Anton',
    'https://en.wikipedia.org/wiki/German_military_administration_in_occupied_France_during_World_War_II',
  ],
  note: "The line's course is the Département de l'Ain's open dataset (data.gouv.fr, Licence Ouverte 2.0), drawn from the armistice convention and period maps.",
  places: `
# --- Germany
Emden | | <..>
Münster | | <..>
Cologne | | <..>
Aachen | | <..>
Trier | | <..>
Saarbrücken | | <..>
Karlsruhe | | <..>
Freiburg | Freiburg im Breisgau | <..>
# --- Neutral Switzerland
Basel | | n
Bern | | n
Lausanne | | n
Geneva | | n
# --- The Low Countries
Groningen | | <..>
Amsterdam | | <..>
Arnhem | | <..>
Rotterdam | | <..>
Maastricht | | <..>
Antwerp | | <..>
Brussels | | <..>
Ghent | | <..>
Liège | | <..>
Luxembourg | Luxembourg City | <..>
# --- The occupied zone
Lille | | <..>
Rouen | | <..>
Caen | | <..>
Cherbourg | Cherbourg-en-Cotentin | <..>
Brest | Brest, France | <..>
Rennes | | <..>
Nantes | | <..>
Paris | | <..>
Reims | | <..>
Metz | | <..>
Strasbourg | | <..>
Nancy | Nancy, France | <..>
Épinal | | <..>
Colmar | | <..>
Mulhouse | | <..>
Belfort | | <..>
Troyes | | <..>
Orléans | | <..>
Dijon | | <..>
Besançon | | <..>
La Rochelle | | <..>
Bordeaux | | <..>
# --- The demarcation line itself (Département de l'Ain, Licence Ouverte 2.0): occupied on its
# --- left going from Spain to Switzerland, free on its right until 11 November 1942
@line demarcation-line.json | <..> | 1942-11-11..> | 8 | 5
# --- Near the line, on the occupied side
Bayonne | | <..>
Hendaye | | <..>
Angoulême | | <..>
Poitiers | | <..>
Châtellerault | | <..>
Tours | | <..>
Bourges | | <..>
Nevers | | <..>
Autun | | <..>
Pontarlier | | <..>
Gex | @46.33,6.06 | <..>
Les Rousses | @46.48,6.08 | <..>
Mouthe | @46.71,6.19 | <..>
Morteau | @47.06,6.6 | <..>
Maîche | @47.25,6.8 | <..>
Saint-Hippolyte | @47.32,6.82 | <..>
Montbéliard | @47.51,6.8 | <..>
Delle | @47.51,7.0 | <..>
# --- Near the line, in the free zone
Pau | Pau, Pyrénées-Atlantiques | 1942-11-11..>
Bergerac | Bergerac, Dordogne | 1942-11-11..>
Périgueux | | 1942-11-11..>
Le Blanc | Le Blanc, Indre | 1942-11-11..>
Issoudun | | 1942-11-11..>
Montluçon | | 1942-11-11..>
Vichy | | 1942-11-11..>
Mâcon | | 1942-11-11..>
Bourg-en-Bresse | | 1942-11-11..>
Nantua | | 1942-11-11..>
Annecy | | 1942-11-11..>
# --- The rest of the free zone
Châteauroux | | 1942-11-11..>
Limoges | | 1942-11-11..>
Clermont-Ferrand | | 1942-11-11..>
Lyon | | 1942-11-11..>
Saint-Étienne | | 1942-11-11..>
Grenoble | | 1942-11-11..>
Valence | Valence, Drôme | 1942-11-11..>
Agen | | 1942-11-11..>
Toulouse | | 1942-11-11..>
Tarbes | | 1942-11-11..>
Perpignan | | 1942-11-12..>
Montpellier | | 1942-11-12..>
Avignon | | 1942-11-11..>
Marseille | | 1942-11-12..>
Toulon | | 1942-11-27..>
Nice | | 1942-11-11..>
`,
};
