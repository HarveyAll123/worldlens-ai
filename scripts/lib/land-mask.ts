/**
 * A raster land mask from Natural Earth 1:10m land polygons (public domain), for classifying
 * boundary lines at build time: 0 = sea, 1 = land within one cell (~3 km) of the coast,
 * 2 = inland. Lakes count as land (Natural Earth's land layer does not cut them out), so
 * borders through lakes are inland.
 */
const NE_COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
const LAND_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson/ne_10m_land.geojson`;

export const MASK_RES = 0.03;
const W = Math.round(360 / MASK_RES);
const H = Math.round(180 / MASK_RES);

export interface LandMask {
  /** 0 sea, 1 coastal land, 2 inland. */
  at(lon: number, lat: number): 0 | 1 | 2;
}

type Ring = Array<[number, number]>;

export async function loadLandMask(): Promise<LandMask> {
  const res = await fetch(LAND_URL);
  if (!res.ok) throw new Error(`Natural Earth land download failed: ${res.status}`);
  const geo = (await res.json()) as {
    features: Array<{
      geometry:
        { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
    }>;
  };
  // Even-odd scanline fill at each row's centre latitude.
  const rows: number[][] = Array.from({ length: H }, () => []);
  for (const f of geo.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys)
      for (const ring of poly)
        for (let i = 0; i + 1 < ring.length; i++) {
          const [x1, y1] = ring[i]!;
          const [x2, y2] = ring[i + 1]!;
          if (y1 === y2) continue;
          const r0 = Math.ceil((Math.min(y1, y2) + 90) / MASK_RES - 0.5);
          const r1 = Math.floor((Math.max(y1, y2) + 90) / MASK_RES - 0.5);
          for (let r = Math.max(0, r0); r <= Math.min(H - 1, r1); r++) {
            const y = (r + 0.5) * MASK_RES - 90;
            if (y < Math.min(y1, y2) || y >= Math.max(y1, y2)) continue;
            rows[r]!.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
          }
        }
  }
  const land = new Uint8Array(W * H);
  for (let r = 0; r < H; r++) {
    const xs = rows[r]!.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k]! + 180) / MASK_RES - 0.5));
      const c1 = Math.min(W - 1, Math.floor((xs[k + 1]! + 180) / MASK_RES - 0.5));
      land.fill(1, r * W + c0, r * W + c1 + 1);
    }
  }
  // Inland = land whose eight neighbours are land too.
  const cls = new Uint8Array(W * H);
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (!land[i]) continue;
      let inland = true;
      for (let dr = -1; dr <= 1 && inland; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = (c + dc + W) % W;
          if (rr < 0 || rr >= H || !land[rr * W + cc]) {
            inland = false;
            break;
          }
        }
      cls[i] = inland ? 2 : 1;
    }
  return {
    at(lon, lat) {
      const c = Math.min(W - 1, Math.max(0, Math.floor((lon + 180) / MASK_RES)));
      const r = Math.min(H - 1, Math.max(0, Math.floor((lat + 90) / MASK_RES)));
      return cls[r * W + c] as 0 | 1 | 2;
    },
  };
}

/**
 * Where a boundary line lies: '2' mostly inland, '1' mostly on land but near the coast,
 * '0' mostly at sea (coastline / maritime limit). Sampled evenly along the full geometry.
 */
export function classifyLine(mask: LandMask, points: Array<[number, number]>): '0' | '1' | '2' {
  const n = Math.min(points.length, 24);
  let landCount = 0;
  let inland = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = points[Math.round((i * (points.length - 1)) / Math.max(1, n - 1))]!;
    const v = mask.at(x, y);
    if (v > 0) landCount++;
    if (v === 2) inland++;
  }
  if (inland / n >= 0.5) return '2';
  if (landCount / n >= 0.5) return '1';
  return '0';
}
