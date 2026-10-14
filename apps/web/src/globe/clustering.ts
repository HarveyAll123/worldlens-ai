/**
 * Screen-space grid clustering for event markers. Pure and deterministic so it can be tested
 * without WebGL. Recomputed only when the camera settles or moves noticeably — never per frame.
 */
export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
  /** Higher weight wins the cluster's representative slot (importance, selection). */
  weight: number;
}

export interface ScreenCluster {
  ids: string[];
  x: number;
  y: number;
  representativeId: string;
}

export function clusterScreenPoints(points: ScreenPoint[], cellPx: number): ScreenCluster[] {
  if (cellPx <= 0)
    return points.map((p) => ({ ids: [p.id], x: p.x, y: p.y, representativeId: p.id }));
  const cells = new Map<string, ScreenPoint[]>();
  for (const p of points) {
    const key = `${Math.floor(p.x / cellPx)}:${Math.floor(p.y / cellPx)}`;
    const list = cells.get(key);
    if (list) list.push(p);
    else cells.set(key, [p]);
  }
  const out: ScreenCluster[] = [];
  for (const list of cells.values()) {
    list.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
    const rep = list[0]!;
    if (list.length === 1) {
      out.push({ ids: [rep.id], x: rep.x, y: rep.y, representativeId: rep.id });
      continue;
    }
    let sx = 0;
    let sy = 0;
    for (const p of list) {
      sx += p.x;
      sy += p.y;
    }
    out.push({
      ids: list.map((p) => p.id),
      x: sx / list.length,
      y: sy / list.length,
      representativeId: rep.id,
    });
  }
  return out;
}

/** Choose which singletons get text labels within a budget (most important first). */
export function pickLabels<T extends { id: string; weight: number }>(
  items: T[],
  budget: number,
): Set<string> {
  return new Set(
    [...items]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, Math.max(0, budget))
      .map((i) => i.id),
  );
}
