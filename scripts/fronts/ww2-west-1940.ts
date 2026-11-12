import type { TheatreSource } from './types';

/**
 * Germany's campaign in the Low Countries and France, 10 May – 25 June 1940 (the armistice came
 * into force on the 25th). Side A is Germany. Places Germany reached only after the armistice
 * (Bordeaux, the Atlantic coast to Spain) are not German here.
 */
export const WW2_WEST_1940: TheatreSource = {
  id: 'ww2-battle-of-france',
  name: 'Battle of France',
  war: 'World War II',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Germany',
  sideB: 'France, Britain, Belgium and the Netherlands',
  start: '1940-05-10',
  end: '1940-06-25',
  horizonDays: 8,
  maxEdgeKm: 420,
  colorA: 'germany',
  colorB: 'france',
  politiesA: '^(german reich|germany-luxembourg|protectorate of bohemia)',
  politiesB: '^(french republic|france|belgium|kingdom of the netherlands|luxembourg)$',
  sources: [
    'https://en.wikipedia.org/wiki/Battle_of_France',
    'https://en.wikipedia.org/wiki/Battle_of_the_Netherlands',
    'https://en.wikipedia.org/wiki/Battle_of_Belgium',
    'https://en.wikipedia.org/wiki/Fall_Rot',
  ],
  places: `
# --- Germany
Emden | | <..>
Münster | | <..>
Düsseldorf | | <..>
Cologne | | <..>
Aachen | | <..>
Koblenz | | <..>
Trier | | <..>
Saarbrücken | | <..>
Karlsruhe | | <..>
Freiburg | Freiburg im Breisgau | <..>
# --- Neutral Switzerland
Basel | | n
Bern | | n
Zürich | | n
Geneva | | n
Lausanne | | n
Chur | | n
Lugano | | n
# --- The Netherlands
Groningen | | 1940-05-10..>
Arnhem | | 1940-05-10..>
Venlo | | 1940-05-10..>
Maastricht | | 1940-05-10..>
Eindhoven | | 1940-05-11..>
Breda | | 1940-05-13..>
Rotterdam | | 1940-05-14..>
Utrecht | | 1940-05-15..>
The Hague | | 1940-05-15..>
Amsterdam | | 1940-05-15..>
Alkmaar | @52.63,4.75 | 1940-05-15..>
Den Helder | @52.96,4.76 | 1940-05-15..>
Middelburg | Middelburg, Zeeland | 1940-05-17..>
# --- Belgium and Luxembourg
Luxembourg | Luxembourg City | 1940-05-10..>
Bastogne | | 1940-05-10..>
Liège | | 1940-05-12..>
Dinant | | 1940-05-13..>
Namur | | 1940-05-15..>
Leuven | | 1940-05-16..>
Brussels | | 1940-05-17..>
Charleroi | | 1940-05-17..>
Antwerp | | 1940-05-18..>
Mons | Mons, Belgium | 1940-05-19..>
Tournai | | 1940-05-22..>
Ghent | | 1940-05-23..>
Kortrijk | | 1940-05-25..>
Bruges | | 1940-05-28..>
Ostend | | 1940-05-29..>
Ypres | | 1940-05-29..>
# --- Northern France
Sedan | Sedan, Ardennes | 1940-05-12..>
Charleville | Charleville-Mézières | 1940-05-14..>
Laon | | 1940-05-16..>
Saint-Quentin | Saint-Quentin, Aisne | 1940-05-18..>
Cambrai | | 1940-05-18..>
Amiens | | 1940-05-20..>
Abbeville | | 1940-05-20..>
Arras | | 1940-05-23..>
Boulogne | Boulogne-sur-Mer | 1940-05-25..>
Calais | | 1940-05-26..>
Lille | | 1940-05-31..>
Dunkirk | | 1940-06-04..>
Soissons | | 1940-06-08..>
Rouen | | 1940-06-09..>
Compiègne | | 1940-06-09..>
Rethel | | 1940-06-10..>
Reims | | 1940-06-11..>
Le Havre | | 1940-06-13..>
Paris | | 1940-06-14..>
Troyes | | 1940-06-14..>
Verdun | | 1940-06-15..>
Chaumont | Chaumont, Haute-Marne | 1940-06-15..>
# --- The rest of France
Orléans | | 1940-06-16..>
Dijon | | 1940-06-16..>
Besançon | | 1940-06-16..>
Metz | | 1940-06-17..>
Colmar | | 1940-06-17..>
Nevers | | 1940-06-17..>
Pontarlier | | 1940-06-17..>
Nancy | Nancy, France | 1940-06-18..>
Belfort | | 1940-06-18..>
Caen | | 1940-06-18..>
Le Mans | | 1940-06-18..>
Rennes | | 1940-06-18..>
Strasbourg | | 1940-06-19..>
Cherbourg | Cherbourg-en-Cotentin | 1940-06-19..>
Brest | Brest, France | 1940-06-19..>
Nantes | | 1940-06-19..>
Angers | | 1940-06-19..>
Vichy | | 1940-06-19..>
Lyon | | 1940-06-19..>
Tours | | 1940-06-21..>
Clermont-Ferrand | | 1940-06-21..>
La Rochelle | | 1940-06-22..>
Poitiers | | 1940-06-23..>
Angoulême | | 1940-06-24..>
Saint-Étienne | | 1940-06-24..>
Bordeaux | | -
Limoges | | -
Toulouse | | -
Montpellier | | -
Marseille | | -
Grenoble | | -
Chambéry | | -
Nice | | -
`,
};
