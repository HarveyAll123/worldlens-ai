/**
 * Marker clustering anchored to the map, not the screen. Points are grouped on a latitude /
 * longitude grid whose cell size is fixed per zoom level, so panning never changes which
 * points share a cluster (screen-space grids did, which made markers flicker as the globe
 * moved). Levels change only when the zoom moves well past a threshold (hysteresis).
 * Pure and deterministic so it can be tested without WebGL.
 */
export interface GeoPoint {
  id: string;
  lat: number;
  lon: number;
  /** Higher weight wins the cluster's representative slot (importance, selection). */
  weight: number;
}

export interface GeoCluster {
  /** Stable identity for this cluster at this level (grid cell). */
  key: string;
  ids: string[];
  representativeId: string;
}

/** Cell size at level 0, in degrees; each level doubles it. */
const BASE_CELL_DEG = 0.01;

export function cellDegForLevel(level: number): number {
  return BASE_CELL_DEG * 2 ** level;
}

/**
 * Zoom level for a wanted cell size (degrees). Stays at `current` unless the wanted size is
 * more than ~40% away from that level's size, so small zoom changes never re-cluster.
 */
export function clusterLevel(wantedCellDeg: number, current: number | null): number {
  const exact = Math.log2(Math.max(1e-6, wantedCellDeg) / BASE_CELL_DEG);
  if (current !== null && Math.abs(exact - current) < 0.5 + 0.15) return current;
  return Math.max(0, Math.round(exact));
}

export function clusterGeo(points: GeoPoint[], level: number): GeoCluster[] {
  const cell = cellDegForLevel(level);
  const cells = new Map<string, GeoPoint[]>();
  for (const p of points) {
    const row = Math.floor((p.lat + 90) / cell);
    // Longitude cells widen towards the poles so cells stay roughly square on the ground.
    const rowLat = Math.min(85, Math.abs(-90 + (row + 0.5) * cell));
    const lonCell = cell / Math.max(0.15, Math.cos((rowLat * Math.PI) / 180));
    const col = Math.floor((p.lon + 180) / lonCell);
    const key = `${level}:${row}:${col}`;
    const list = cells.get(key);
    if (list) list.push(p);
    else cells.set(key, [p]);
  }
  const out: GeoCluster[] = [];
  for (const [key, list] of cells) {
    list.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
    out.push({ key, ids: list.map((p) => p.id), representativeId: list[0]!.id });
  }
  return out;
}

export interface LabelCandidate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  weight: number;
}

/**
 * Most important labels first, skipping any that would overlap one already placed, up to
 * `budget`. Run when the camera settles — not while it moves — so labels do not churn.
 */
/**
 * True when every point lies within `km` of the first: events pinned to one place ("Germany",
 * "Delhi, India") that no zoom can pull apart — the finest cluster cell (BASE_CELL_DEG) is
 * about 1 km. Such a cluster opens a list to choose from instead of zooming in.
 */
export function atOnePlace(points: Array<{ lat: number; lon: number }>, km = 1): boolean {
  const [first, ...rest] = points;
  if (!first || rest.length === 0) return false;
  const cos = Math.cos(first.lat * (Math.PI / 180));
  return rest.every((p) => Math.hypot((p.lon - first.lon) * cos, p.lat - first.lat) * 111.2 <= km);
}

export interface MarkerBox {
  /** The marker's own key: its title may touch it. */
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Whether a title's box is clear of every marker but its own. A title beside one battle used
 * to lie across the next battle's marker, or under a cluster's count.
 */
export function clearOfMarkers(
  box: { x: number; y: number; width: number; height: number },
  ownId: string,
  markers: MarkerBox[],
): boolean {
  return !markers.some(
    (m) =>
      m.id !== ownId &&
      box.x < m.x + m.width &&
      box.x + box.width > m.x &&
      box.y < m.y + m.height &&
      box.y + box.height > m.y,
  );
}

export function placeLabels(items: LabelCandidate[], budget: number): Set<string> {
  const placed: LabelCandidate[] = [];
  const out = new Set<string>();
  for (const c of [...items].sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))) {
    if (out.size >= budget) break;
    const clash = placed.some(
      (p) =>
        c.x < p.x + p.width && c.x + c.width > p.x && c.y < p.y + p.height && c.y + c.height > p.y,
    );
    if (clash) continue;
    placed.push(c);
    out.add(c.id);
  }
  return out;
}
