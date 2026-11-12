import type { TheatreSource } from './types';

/**
 * The Allies against the Axis in Italy, from the landing in Sicily (10 July 1943) to the
 * German surrender in Italy (2 May 1945). Side A is the Axis (Germany alone after Italy's
 * armistice of 8 September 1943).
 */
export const WW2_ITALY: TheatreSource = {
  id: 'ww2-italian-front',
  name: 'Italian front',
  war: 'World War II',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Axis (Germany)',
  sideB: 'Allies',
  start: '1943-07-10',
  end: '1945-05-02',
  maxEdgeKm: 330,
  colorA: 'germany',
  colorB: 'allies',
  politiesA:
    '^(italy|kingdom of italy|german occupation of italy|italian social republic|allied military government)',
  politiesB: '^$',
  sources: [
    'https://en.wikipedia.org/wiki/Italian_campaign_(World_War_II)',
    'https://en.wikipedia.org/wiki/Allied_invasion_of_Sicily',
    'https://en.wikipedia.org/wiki/Battle_of_Monte_Cassino',
    'https://en.wikipedia.org/wiki/Gothic_Line',
    'https://en.wikipedia.org/wiki/Spring_1945_offensive_in_Italy',
  ],
  places: `
# --- Sicily
Licata | | <..1943-07-10
Gela | | <..1943-07-11
Syracuse | Syracuse, Sicily | <..1943-07-10
Augusta | Augusta, Sicily | <..1943-07-13
Agrigento | | <..1943-07-16
Enna | | <..1943-07-20
Palermo | | <..1943-07-22
Trapani | | <..1943-07-23
Catania | | <..1943-08-05
Troina | | <..1943-08-06
Randazzo | | <..1943-08-13
Messina | | <..1943-08-17
# --- The south
Reggio Calabria | | <..1943-09-03
Taranto | | <..1943-09-09
Brindisi | | <..1943-09-11
Bari | | <..1943-09-14
Salerno | | <..1943-09-10
Potenza | | <..1943-09-20
Foggia | | <..1943-09-27
Avellino | | <..1943-09-30
Naples | | <..1943-10-01
Benevento | | <..1943-10-03
Termoli | | <..1943-10-03
Caserta | | <..1943-10-05
Capua | | <..1943-10-06
Campobasso | | <..1943-10-14
Isernia | | <..1943-11-04
Vasto | | <..1943-11-05
Lanciano | | <..1943-12-03
Ortona | | <..1943-12-28
# --- The Gustav Line, Anzio and Rome
Cassino | | <..1944-05-18
Formia | | <..1944-05-17
Gaeta | | <..1944-05-19
Terracina | | <..1944-05-24
Anzio | | <..1944-01-22
Aprilia | Aprilia, Lazio | <..1944-01-25, 1944-02-09..1944-05-28
Cisterna | Cisterna di Latina | <..1944-05-25
Littoria | Latina, Lazio | <..1944-05-25
Velletri | | <..1944-06-02
Frosinone | | <..1944-05-31
Avezzano | | <..1944-06-10
Sulmona | | <..1944-06-09
Chieti | | <..1944-06-09
Pescara | | <..1944-06-10
Rome | | <..1944-06-04
Civitavecchia | | <..1944-06-07
Cagliari | @39.22,9.12 | <..1943-09-18
Sassari | @40.73,8.56 | <..1943-09-18
Olbia | @40.92,9.5 | <..1943-09-18
Ajaccio | @41.92,8.74 | <..1943-09-09
Bastia | @42.7,9.45 | <..1943-10-04
Viterbo | | <..1944-06-09
L'Aquila | | <..1944-06-13
Terni | | <..1944-06-14
# --- Central Italy and the Gothic Line
Grosseto | | <..1944-06-15
Perugia | | <..1944-06-20
Siena | | <..1944-07-03
Arezzo | | <..1944-07-16
Ancona | | <..1944-07-18
Livorno | | <..1944-07-19
Florence | | <..1944-08-11
Pisa | | <..1944-09-02
Pesaro | | <..1944-09-02
Lucca | | <..1944-09-05
Pistoia | | <..1944-09-08
Rimini | | <..1944-09-21
Cesena | | <..1944-10-20
Forlì | | <..1944-11-09
Ravenna | | <..1944-12-04
Faenza | | <..1944-12-16
# --- Neutral Switzerland
Lugano | | n
Chur | | n
Geneva | | n
Bern | | n
# --- The Po valley
Massa | Massa, Tuscany | <..1945-04-10
Imola | | <..1945-04-14
Argenta | Argenta, Emilia–Romagna | <..1945-04-17
Bologna | | <..1945-04-21
Modena | | <..1945-04-22
Ferrara | | <..1945-04-24
La Spezia | | <..1945-04-24
Parma | | <..1945-04-25
Mantua | | <..1945-04-25
Verona | | <..1945-04-26
Genoa | | <..1945-04-27
Brescia | | <..1945-04-28
Padua | | <..1945-04-28
Como | | <..1945-04-28
Milan | | <..1945-04-29
Venice | | <..1945-04-29
Turin | | <..1945-04-30
Udine | | <..1945-05-01
Trieste | | <..>
Trento | | <..>
Bolzano | | <..>
`,
};
