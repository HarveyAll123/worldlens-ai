import type { TheatreSource } from './types';

/**
 * Germany against France, Britain and Belgium, 4 August 1914 – 11 November 1918. Side A is
 * Germany. The trench line of 1915–17 moved by a few kilometres in the great battles — less
 * than this reconstruction can show; it shows the sweep of 1914, the withdrawal to the
 * Hindenburg Line (1917), the German offensives of spring 1918 and the Allied advance.
 */
export const WW1_WESTERN_FRONT: TheatreSource = {
  id: 'ww1-western-front',
  name: 'Western Front',
  war: 'World War I',
  conflictId: 'conflict-world-war-i',
  sideA: 'Germany',
  sideB: 'France, Britain, Belgium and their allies',
  start: '1914-08-04',
  end: '1918-11-11',
  horizonDays: 21,
  maxEdgeKm: 330,
  colorA: 'germany',
  colorB: 'france',
  politiesA: '^(german reich|german empire|germany-luxembourg)',
  politiesB: '^(french republic|france|belgium|luxembourg)$',
  sources: [
    'https://en.wikipedia.org/wiki/Western_Front_(World_War_I)',
    'https://en.wikipedia.org/wiki/First_Battle_of_the_Marne',
    'https://en.wikipedia.org/wiki/Operation_Alberich',
    'https://en.wikipedia.org/wiki/German_spring_offensive',
    'https://en.wikipedia.org/wiki/Hundred_Days_Offensive',
  ],
  places: `
# --- Germany and Alsace-Lorraine (German since 1871)
Cologne | | <..>
Aachen | | <..>
Koblenz | | <..>
Trier | | <..>
Saarbrücken | | <..>
Luxembourg | Luxembourg City | <..>
Thionville | | <..>
Metz | | <..>
Strasbourg | | <..>
Colmar | | <..>
Mulhouse | | <..>
Freiburg | Freiburg im Breisgau | <..>
Thann | Thann, Haut-Rhin | <..1914-08-07
# --- Neutral Switzerland
Basel | | n
Bern | | n
Zürich | | n
Geneva | | n
Lausanne | | n
Chur | | n
Lugano | | n
# --- Belgium
Liège | | 1914-08-07..>
Leuven | | 1914-08-19..>
Brussels | | 1914-08-20..>
Namur | | 1914-08-23..>
Dinant | | 1914-08-23..>
Charleroi | | 1914-08-23..>
Mons | Mons, Belgium | 1914-08-23..1918-11-11
Tournai | | 1914-08-24..1918-11-08
Antwerp | | 1914-10-09..>
Ghent | | 1914-10-12..>
Kortrijk | | 1914-10-12..1918-10-16
Bruges | | 1914-10-14..1918-10-19
Ostend | | 1914-10-15..1918-10-17
Roeselare | | 1914-10-19..1918-10-14
Diksmuide | | 1914-11-10..1918-09-29
Passchendaele | Passendale | 1914-10-20..1917-11-06, 1918-04-16..1918-09-28
Messines | Mesen | 1914-11-01..1917-06-07, 1918-04-11..1918-09-28
Ypres | | -
Nieuwpoort | Nieuwpoort, Belgium | -
Veurne | | -
# --- Flanders and Artois (France)
Lille | | 1914-10-12..1918-10-17
Douai | | 1914-10-01..1918-10-17
Lens | Lens, Pas-de-Calais | 1914-10-04..1918-10-03
Armentières | | 1918-04-11..1918-10-03
Bailleul | Bailleul, Nord | 1918-04-15..1918-08-30
Valenciennes | | 1914-08-25..1918-11-02
Maubeuge | | 1914-09-07..1918-11-09
Cambrai | | 1914-08-26..1918-10-09
Le Cateau | Le Cateau-Cambrésis | 1914-08-26..1918-10-10
Arras | | -
Béthune | | -
Hazebrouck | | -
Saint-Omer | | -
Dunkirk | | -
Calais | | -
Doullens | | -
Abbeville | | -
# --- The Somme and the Oise
Bapaume | | 1914-09-26..1917-03-17, 1918-03-24..1918-08-29
Péronne | Péronne, Somme | 1914-08-28..1917-03-18, 1918-03-24..1918-09-01
Albert | Albert, Somme | 1918-03-26..1918-08-22
Amiens | | 1914-08-31..1914-09-11
Montdidier | Montdidier, Somme | 1918-03-27..1918-08-10
Roye | Roye, Somme | 1914-08-30..1917-03-17, 1918-03-26..1918-08-27
Noyon | | 1914-08-30..1917-03-18, 1918-03-25..1918-08-29
Ham | Ham, Somme | 1914-08-28..1917-03-19, 1918-03-23..1918-09-06
Chauny | | 1914-09-01..1917-03-19, 1918-03-24..1918-09-06
Saint-Quentin | Saint-Quentin, Aisne | 1914-08-28..1918-10-01
La Fère | | 1914-08-31..1918-10-13
Guise | | 1914-08-28..1918-11-05
Hirson | | 1914-08-27..1918-11-09
Compiègne | | 1914-08-31..1914-09-12
Senlis | | 1914-09-02..1914-09-09
Beauvais | | -
Paris | | -
Meaux | | -
# --- The Aisne, the Marne and Champagne
Laon | | 1914-09-02..1918-10-13
Soissons | | 1914-09-01..1914-09-12, 1918-05-29..1918-08-02
Fismes | | 1914-09-02..1914-09-12, 1918-05-28..1918-08-04
Château-Thierry | | 1914-09-02..1914-09-09, 1918-06-01..1918-07-21
Montmirail | Montmirail, Marne | 1914-09-04..1914-09-09
Coulommiers | @48.815,3.085 | 1914-09-04..1914-09-07
Épernay | | 1914-09-04..1914-09-11
Reims | | 1914-09-04..1914-09-12
Châlons | Châlons-en-Champagne | 1914-09-04..1914-09-11
Vitry-le-François | | 1914-09-05..1914-09-11
Rethel | | 1914-08-29..1918-11-06
Vouziers | | 1914-08-30..1918-10-12
Villers-Cotterêts | | -
Provins | | -
Troyes | | -
Sainte-Menehould | | -
Bar-le-Duc | | -
# --- The Meuse, Lorraine and the Vosges
Charleville-Mézières | | 1914-08-27..>
Sedan | Sedan, Ardennes | 1914-08-25..>
Montmédy | | 1914-08-27..>
Longwy | | 1914-08-26..>
Briey | | 1914-08-07..>
Stenay | | 1914-08-27..1918-11-11
Varennes | Varennes-en-Argonne | 1914-09-03..1918-09-26
Saint-Mihiel | | 1914-09-24..1918-09-13
Thiaucourt | Thiaucourt-Regniéville | 1914-09-20..1918-09-12
Lunéville | | 1914-08-22..1914-09-12
Saint-Dié | Saint-Dié-des-Vosges | 1914-08-27..1914-09-11
Verdun | | -
Toul | | -
Nancy | Nancy, France | -
Épinal | | -
Belfort | | -
`,
};
