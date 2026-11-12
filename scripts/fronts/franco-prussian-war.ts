import type { TheatreSource } from './types';

/**
 * The Franco-Prussian War, 19 July 1870 – 1 March 1871: the German invasion through Alsace and
 * Lorraine, Sedan, the siege of Paris, and the campaigns on the Loire, in the north and in the
 * east. Side A is the German states. Paris itself was besieged, not taken. Smaller towns
 * behind the armies are dated to within a few days.
 */
export const FRANCO_PRUSSIAN_WAR: TheatreSource = {
  id: 'franco-prussian-war',
  name: 'Franco-Prussian War: the German advance',
  war: 'Franco-Prussian War',
  conflictId: 'conflict-franco-prussian-war',
  sideA: 'North German Confederation, Bavaria, Württemberg and Baden',
  sideB: 'France',
  start: '1870-07-19',
  end: '1871-03-01',
  horizonDays: 14,
  maxEdgeKm: 420,
  colorA: 'germany',
  colorB: 'france',
  politiesA:
    '^(north german confederation|kingdom of bavaria|kingdom of württemberg|württemberg|baden|grand duchy of baden|grand duchy of hesse|hesse)',
  politiesB: '^(second french empire|french republic|french empire)',
  sources: [
    'https://en.wikipedia.org/wiki/Franco-Prussian_War',
    'https://en.wikipedia.org/wiki/Siege_of_Metz_(1870)',
    'https://en.wikipedia.org/wiki/Siege_of_Paris_(1870%E2%80%931871)',
    'https://en.wikipedia.org/wiki/Loire_campaign_(1870%E2%80%931871)',
  ],
  places: `
# --- Germany
Trier | @49.75,6.64 | <..>
Saarbrücken | @49.23,7.0 | <..1870-08-02, 1870-08-06..>
Mainz | @50.0,8.27 | <..>
Landau | @49.2,8.12 | <..>
Karlsruhe | @49.01,8.4 | <..>
Kehl | @48.57,7.82 | <..>
Freiburg | @47.99,7.85 | <..>
# --- Alsace and Lorraine
Wissembourg | @49.04,7.95 | 1870-08-04..>
Wörth | @48.94,7.75 | 1870-08-06..>
Forbach | @49.19,6.9 | 1870-08-06..>
Haguenau | @48.82,7.79 | 1870-08-07..>
Sarreguemines | @49.11,7.07 | 1870-08-07..>
Saverne | @48.74,7.36 | 1870-08-08..>
Lunéville | @48.59,6.5 | 1870-08-12..>
Nancy | @48.69,6.18 | 1870-08-12..>
Pont-à-Mousson | @48.9,6.05 | 1870-08-13..>
Bar-le-Duc | @48.77,5.16 | 1870-08-17..>
Colmar | @48.08,7.36 | 1870-09-14..>
Toul | @48.68,5.89 | 1870-09-23..>
Strasbourg | @48.58,7.75 | 1870-09-28..>
Mulhouse | @47.75,7.34 | 1870-10-03..>
Épinal | @48.17,6.45 | 1870-10-12..>
Sélestat | @48.26,7.45 | 1870-10-24..>
Metz | @49.12,6.18 | 1870-10-27..>
Verdun | @49.16,5.38 | 1870-11-08..>
Thionville | @49.36,6.17 | 1870-11-24..>
Belfort | @47.64,6.86 | 1871-02-18..>
# --- Champagne and the road to Paris
Châlons | @48.96,4.36 | 1870-08-24..>
Sedan | @49.7,4.94 | 1870-09-02..>
Reims | @49.26,4.03 | 1870-09-05..>
Laon | @49.56,3.62 | 1870-09-09..>
Meaux | @48.96,2.88 | 1870-09-15..>
Fontainebleau | @48.4,2.7 | 1870-09-17..>
Versailles | @48.8,2.13 | 1870-09-19..>
Compiègne | @49.42,2.83 | 1870-09-20..>
Beauvais | @49.43,2.08 | 1870-09-30..>
Soissons | @49.38,3.32 | 1870-10-16..>
Troyes | @48.3,4.07 | 1870-11-08..>
Mézières | @49.76,4.72 | 1871-01-02..>
Paris | @48.86,2.35 | -
# --- The north
Amiens | @49.89,2.3 | 1870-11-28..>
Rouen | @49.44,1.1 | 1870-12-05..>
Évreux | @49.02,1.15 | 1870-12-08..>
Dieppe | @49.92,1.08 | 1870-12-09..>
Péronne | @49.93,2.93 | 1871-01-10..>
Saint-Quentin | @49.85,3.29 | 1871-01-19..>
Le Havre | @49.49,0.11 | -
Arras | @50.29,2.78 | -
Lille | @50.63,3.06 | -
# --- The Loire and the west
Orléans | @47.9,1.9 | 1870-10-11..1870-11-09, 1870-12-04..>
Châteaudun | @48.07,1.33 | 1870-10-18..>
Chartres | @48.45,1.49 | 1870-10-21..>
Auxerre | @47.8,3.57 | 1870-11-20..>
Montargis | @48.0,2.73 | 1870-11-22..>
Gien | @47.69,2.63 | 1870-12-07..>
Blois | @47.59,1.33 | 1870-12-13..>
Vendôme | @47.79,1.07 | 1870-12-16..>
Le Mans | @48.0,0.2 | 1871-01-12..>
Alençon | @48.43,0.09 | 1871-01-16..>
Tours | @47.39,0.69 | 1871-01-19..>
Laval | @48.07,-0.77 | -
Nantes | @47.22,-1.55 | -
Cherbourg | @49.64,-1.62 | -
Bourges | @47.08,2.4 | -
Nevers | @46.99,3.16 | -
# --- Burgundy and the Jura
Vesoul | @47.62,6.16 | 1870-10-18..>
Dijon | @47.32,5.04 | 1870-10-31..1870-12-27, 1871-02-01..>
Pontarlier | @46.9,6.35 | 1871-02-01..>
Langres | @47.86,5.33 | -
Besançon | @47.24,6.02 | -
Lyon | @45.76,4.84 | -
`,
};
