import type { TheatreSource } from './types';

/**
 * The Western Allies against Germany, from the Normandy landings (6 June 1944) to the
 * surrender (8 May 1945). Side A is Germany: a period is the time a place stayed in German
 * hands. The Atlantic fortresses that held out to the end, and the cities the Western Allies
 * never reached (Berlin, Dresden, Prague), are German throughout.
 */
export const WW2_WESTERN_FRONT: TheatreSource = {
  id: 'ww2-western-front',
  name: 'Western Front',
  war: 'World War II',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Germany',
  sideB: 'Western Allies',
  start: '1944-06-06',
  end: '1945-05-08',
  maxEdgeKm: 420,
  colorA: 'germany',
  colorB: 'allies',
  politiesA: '^(german reich|germany-luxembourg|protectorate of bohemia)',
  politiesB:
    '^(french state|french republic|france|belgium|military administration in belgium|reichskommissariat belgien|kingdom of the netherlands|luxembourg)',
  sources: [
    'https://en.wikipedia.org/wiki/Western_Front_(World_War_II)',
    'https://en.wikipedia.org/wiki/Operation_Overlord',
    'https://en.wikipedia.org/wiki/Operation_Dragoon',
    'https://en.wikipedia.org/wiki/Battle_of_the_Bulge',
    'https://en.wikipedia.org/wiki/Western_Allied_invasion_of_Germany',
  ],
  places: `
# --- Normandy and Brittany
Sainte-Mère-Église | | <..1944-06-06
Barneville-Carteret | @49.38,-1.75 | <..1944-06-18
Saint-Sauveur-le-Vicomte | @49.39,-1.53 | <..1944-06-16
Montebourg | @49.49,-1.38 | <..1944-06-19
Valognes | @49.51,-1.47 | <..1944-06-20
Barfleur | @49.67,-1.26 | <..1944-06-21
Beaumont-Hague | @49.66,-1.84 | <..1944-07-01
Isigny | @49.32,-1.1 | <..1944-06-09
Trévières | @49.31,-0.9 | <..1944-06-10
Port-en-Bessin | @49.35,-0.75 | <..1944-06-08
Caumont | @49.09,-0.8 | <..1944-06-13
Tilly-sur-Seulles | @49.18,-0.63 | <..1944-06-19
Ouistreham | @49.28,-0.26 | <..1944-06-06
Troarn | @49.18,-0.18 | <..1944-08-17
Villers-Bocage | @49.08,-0.65 | <..1944-08-04
La Haye-du-Puits | @49.29,-1.54 | <..1944-07-08
Périers | @49.19,-1.41 | <..1944-07-27
Granville | @48.84,-1.6 | <..1944-07-31
Tessy-sur-Vire | @48.97,-1.06 | <..1944-08-01
Villedieu-les-Poêles | @48.84,-1.22 | <..1944-08-02
Saint-Hilaire-du-Harcouët | @48.58,-1.09 | <..1944-08-02
Thury-Harcourt | @48.98,-0.47 | <..1944-08-13
Condé-sur-Noireau | @48.85,-0.55 | <..1944-08-16
Flers | @48.75,-0.57 | <..1944-08-16
Domfront | @48.59,-0.65 | <..1944-08-14
Pont-l'Évêque | @49.29,0.18 | <..1944-08-24
Trouville | @49.37,0.08 | <..1944-08-24
Honfleur | @49.42,0.23 | <..1944-08-25
Bayeux | | <..1944-06-07
Carentan | | <..1944-06-12
Cherbourg | Cherbourg-en-Cotentin | <..1944-06-27
Caen | | <..1944-07-19
Saint-Lô | | <..1944-07-18
Coutances | | <..1944-07-28
Avranches | | <..1944-07-30
Vire | Vire Normandie | <..1944-08-07
Mortain | Mortain-Bocage | <..1944-08-12
Falaise | Falaise, Calvados | <..1944-08-17
Argentan | | <..1944-08-20
Alençon | | <..1944-08-12
Lisieux | | <..1944-08-23
Le Mans | | <..1944-08-08
Laval | Laval, Mayenne | <..1944-08-06
Rennes | | <..1944-08-04
Saint-Malo | | <..1944-08-17
Brest | Brest, France | <..1944-09-19
Quimper | | <..1944-08-08
Vannes | | <..1944-08-06
Lorient | | <..>
Pontivy | | <..1944-08-04
Saint-Nazaire | | <..>
Redon | Redon, Ille-et-Vilaine | <..1944-08-05
Nantes | | <..1944-08-12
Angers | | <..1944-08-10
La Roche-sur-Yon | | <..1944-09-01
Les Sables-d'Olonne | | <..1944-08-28
La Rochelle | | <..>
Royan | | <..1945-04-17
Niort | | <..1944-09-06
Saintes | Saintes, Charente-Maritime | <..1944-09-04
# --- The Seine, Paris and the north
Tours | | <..1944-09-01
Orléans | | <..1944-08-16
Chartres | | <..1944-08-18
Dreux | | <..1944-08-16
Évreux | | <..1944-08-23
Rouen | | <..1944-08-30
Le Havre | | <..1944-09-12
Dieppe | | <..1944-09-01
Paris | | <..1944-08-25
Fontainebleau | | <..1944-08-23
Troyes | | <..1944-08-26
Reims | | <..1944-08-30
Châlons | Châlons-en-Champagne | <..1944-08-29
Verdun | | <..1944-08-31
Soissons | | <..1944-08-29
Compiègne | | <..1944-09-01
Beauvais | | <..1944-08-30
Amiens | | <..1944-08-31
Arras | | <..1944-09-01
Saint-Quentin | Saint-Quentin, Aisne | <..1944-09-02
Lille | | <..1944-09-03
Boulogne | Boulogne-sur-Mer | <..1944-09-22
Calais | | <..1944-09-30
Dunkirk | | <..>
# --- The south and centre
Saint-Tropez | | <..1944-08-15
Draguignan | | <..1944-08-16
Cannes | | <..1944-08-24
Nice | | <..1944-08-28
Toulon | | <..1944-08-27
Marseille | | <..1944-08-28
Aix-en-Provence | | <..1944-08-21
Avignon | | <..1944-08-25
Montpellier | | <..1944-08-24
Perpignan | | <..1944-08-19
Toulouse | | <..1944-08-20
Bordeaux | | <..1944-08-28
Limoges | | <..1944-08-21
Poitiers | | <..1944-09-05
Clermont-Ferrand | | <..1944-08-27
Grenoble | | <..1944-08-22
Montélimar | | <..1944-08-28
Valence | Valence, Drôme | <..1944-08-31
Lyon | | <..1944-09-03
Mâcon | | <..1944-09-04
Dijon | | <..1944-09-11
Besançon | | <..1944-09-08
# --- Lorraine and Alsace
Nancy | Nancy, France | <..1944-09-15
Toul | | <..1944-09-05
Épinal | | <..1944-09-24
Metz | | <..1944-11-22
Thionville | | <..1944-11-14
Saint-Dié | Saint-Dié-des-Vosges | <..1944-11-22
Belfort | | <..1944-11-25
Mulhouse | | <..1944-11-21
Saverne | | <..1944-11-22
Strasbourg | | <..1944-11-23
Haguenau | | <..1944-12-11
Colmar | | <..1945-02-02
# --- Belgium and Luxembourg
Tournai | | <..1944-09-03
Mons | Mons, Belgium | <..1944-09-02
Charleroi | | <..1944-09-04
Brussels | | <..1944-09-03
Antwerp | | <..1944-09-04
Ghent | | <..1944-09-06
Bruges | | <..1944-09-12
Ostend | | <..1944-09-08
Namur | | <..1944-09-06
Liège | | <..1944-09-08
Dinant | | <..1944-09-07
Marche | Marche-en-Famenne | <..1944-09-08
Bastogne | | <..1944-09-10
Arlon | | <..1944-09-10
Luxembourg | Luxembourg City | <..1944-09-10
Malmedy | | <..1944-09-11
Rochefort | Rochefort, Belgium | <..1944-09-08, 1944-12-24..1944-12-30
La Roche | La Roche-en-Ardenne | <..1944-09-10, 1944-12-21..1945-01-11
Houffalize | | <..1944-09-10, 1944-12-19..1945-01-16
Vielsalm | | <..1944-09-10, 1944-12-23..1945-01-18
St. Vith | | <..1944-09-13, 1944-12-21..1945-01-23
Clervaux | | <..1944-09-10, 1944-12-17..1945-01-25
Wiltz | | <..1944-09-10, 1944-12-19..1945-01-21
Diekirch | | <..1944-09-11, 1944-12-19..1945-01-18
Echternach | | <..1944-09-12, 1944-12-17..1944-12-27
# --- The Netherlands
Maastricht | | <..1944-09-14
Eindhoven | | <..1944-09-18
Nijmegen | | <..1944-09-20
's-Hertogenbosch | | <..1944-10-27
Tilburg | | <..1944-10-27
Breda | | <..1944-10-29
Bergen op Zoom | | <..1944-10-27
Middelburg | Middelburg, Zeeland | <..1944-11-06
Venlo | | <..1945-03-01
Roermond | | <..1945-03-01
Arnhem | | <..1945-04-14
Enschede | | <..1945-04-01
Zwolle | | <..1945-04-14
Apeldoorn | | <..1945-04-17
Groningen | | <..1945-04-16
Leeuwarden | | <..1945-04-15
Utrecht | | <..>
Amsterdam | | <..>
Rotterdam | | <..>
The Hague | | <..>
Den Helder | | <..>
# --- The Rhineland and the Ruhr
Aachen | | <..1944-10-21
Geilenkirchen | | <..1944-11-19
Jülich | | <..1945-02-23
Düren | | <..1945-02-25
Kleve | | <..1945-02-11
Goch | | <..1945-02-21
Xanten | | <..1945-03-08
Mönchengladbach | | <..1945-03-01
Krefeld | | <..1945-03-03
Prüm | | <..1945-02-12
Trier | | <..1945-03-02
Cologne | | <..1945-03-06
Bonn | | <..1945-03-09
Remagen | | <..1945-03-07
Koblenz | | <..1945-03-18
Saarbrücken | | <..1945-03-20
Kaiserslautern | | <..1945-03-20
Worms | Worms, Germany | <..1945-03-21
Mainz | | <..1945-03-22
Wesel | | <..1945-03-24
Duisburg | | <..1945-04-12
Essen | | <..1945-04-11
Dortmund | | <..1945-04-13
Wuppertal | | <..1945-04-16
Düsseldorf | | <..1945-04-17
# --- Central and northern Germany
Darmstadt | | <..1945-03-25
Frankfurt | | <..1945-03-29
Wiesbaden | | <..1945-03-28
Giessen | | <..1945-03-28
Marburg | | <..1945-03-28
Siegen | | <..1945-04-06
Paderborn | | <..1945-04-01
Münster | | <..1945-04-02
Osnabrück | | <..1945-04-04
Bielefeld | | <..1945-04-04
Kassel | | <..1945-04-04
Hanover | | <..1945-04-10
Celle | | <..1945-04-12
Brunswick | Braunschweig | <..1945-04-12
Magdeburg | | <..1945-04-18
Lüneburg | | <..1945-04-18
Bremen | | <..1945-04-26
Oldenburg | Oldenburg (city) | <..1945-05-03
Hamburg | | <..1945-05-03
Lübeck | | <..1945-05-02
Wismar | | <..1945-05-02
Schwerin | | <..1945-05-02
Wilhelmshaven | | <..>
Cuxhaven | | <..>
Kiel | | <..>
Flensburg | | <..>
Erfurt | | <..1945-04-12
Weimar | | <..1945-04-12
Jena | | <..1945-04-13
Gera | | <..1945-04-14
Halle | Halle (Saale) | <..1945-04-19
Leipzig | | <..1945-04-19
Dessau | | <..1945-04-23
Torgau | | <..1945-04-25
Zwickau | | <..1945-04-17
Plauen | | <..1945-04-16
Hof | Hof, Bavaria | <..1945-04-15
# --- Southern Germany, Austria and Bohemia
Karlsruhe | | <..1945-04-04
Mannheim | | <..1945-03-29
Heidelberg | | <..1945-03-30
Heilbronn | | <..1945-04-12
Würzburg | | <..1945-04-06
Schweinfurt | | <..1945-04-11
Bamberg | | <..1945-04-13
Bayreuth | | <..1945-04-14
Nuremberg | | <..1945-04-20
Stuttgart | | <..1945-04-22
Tübingen | | <..1945-04-19
Freiburg | Freiburg im Breisgau | <..1945-04-21
Konstanz | | <..1945-04-26
Ulm | | <..1945-04-24
Augsburg | | <..1945-04-28
Ingolstadt | | <..1945-04-26
Regensburg | | <..1945-04-27
Munich | | <..1945-04-30
Landshut | | <..1945-05-01
Passau | | <..1945-05-02
Kempten | | <..1945-04-27
Bregenz | | <..1945-05-01
Innsbruck | | <..1945-05-03
Salzburg | | <..1945-05-04
Linz | | <..1945-05-05
Cheb | | <..1945-04-26
Pilsen | Plzeň | <..1945-05-06
# --- Neutral Switzerland
Basel | | n
Bern | | n
Zürich | | n
Geneva | | n
Lausanne | | n
Chur | | n
Lugano | | n
# --- Never reached from the west
Rostock | | <..>
Berlin | | <..>
Potsdam | | <..>
Wittenberg | | <..>
Dresden | | <..>
Chemnitz | | <..>
Karlsbad | Karlovy Vary | <..>
Prague | | <..>
Budweis | České Budějovice | <..>
# --- The Rhine, travelled downstream: the west bank (left) fell from November 1944 to March 1945, the east bank at the crossings
@line rhine basel = 47.58,7.59; 47.75,7.52; 47.9,7.58 | <..1944-11-21 | <..1945-04-22 | 12 | 5
@line rhine colmar = 47.9,7.58; 48.03,7.58; 48.2,7.67; 48.38,7.75 | <..1945-02-06 | <..1945-04-19 | 12 | 5
@line rhine strasbourg = 48.38,7.75; 48.58,7.8; 48.75,7.97 | <..1944-11-24 | <..1945-04-15 | 12 | 5
@line rhine lauterbourg = 48.75,7.97; 48.97,8.2 | <..1945-03-19 | <..1945-04-04 | 12 | 5
@line rhine palatinate = 48.97,8.2; 49.2,8.38; 49.32,8.45; 49.48,8.45; 49.63,8.37; 49.85,8.35; 50.0,8.27 | <..1945-03-23 | <..1945-03-28 | 14 | 5
@line rhine gorge = 50.0,8.27; 50.0,7.9; 50.1,7.75; 50.35,7.6; 50.55,7.28; 50.73,7.1 | <..1945-03-12 | <..1945-03-24 | 14 | 5
@line rhine cologne = 50.73,7.1; 50.94,6.97; 51.22,6.77; 51.43,6.75 | <..1945-03-07 | <..1945-04-14 | 14 | 5
@line rhine wesel = 51.43,6.75; 51.65,6.62; 51.78,6.4; 51.83,6.2; 51.86,6.05 | <..1945-03-08 | <..1945-03-26 | 14 | 5
`,
};
