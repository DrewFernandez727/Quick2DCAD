/**
 * Geometric shape analysis: area, perimeter, centroid, second moments of area (I_xx, I_yy).
 * All units are mm and mm².
 */
import { Entity, EntityId, LineEntity, CircleEntity, ArcEntity, PointEntity, Vec2 } from './types';

export interface ShapeResult {
  id: string;           // unique key for React list
  label: string;        // human-readable label
  type: 'polygon' | 'circle' | 'arc';
  area: number;         // mm²
  perimeter: number;    // mm
  centroid: Vec2;       // mm
  ixx: number | null;   // mm⁴ — second moment about centroidal horizontal axis
  iyy: number | null;   // mm⁴ — second moment about centroidal vertical axis
  // circle/arc extras
  radius?: number;
  sweepDeg?: number;
}

// ─── Polygon math ────────────────────────────────────────────────────────────

function shoelaceArea(pts: Vec2[]): number {
  const n = pts.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return sum / 2; // signed; positive = CCW
}

function polygonCentroid(pts: Vec2[], area: number): Vec2 {
  const n = pts.length;
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const d = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    cx += (pts[i].x + pts[j].x) * d;
    cy += (pts[i].y + pts[j].y) * d;
  }
  const a6 = 6 * area;
  return { x: cx / a6, y: cy / a6 };
}

/**
 * Second moments of area of a polygon about the ORIGIN axes.
 * Uses Green's theorem formulation.
 */
function polygonMomentsAboutOrigin(pts: Vec2[]): { ix: number; iy: number } {
  const n = pts.length;
  let ix = 0, iy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const { x: xi, y: yi } = pts[i];
    const { x: xj, y: yj } = pts[j];
    const d = xi * yj - xj * yi;
    ix += (yi * yi + yi * yj + yj * yj) * d;
    iy += (xi * xi + xi * xj + xj * xj) * d;
  }
  return { ix: ix / 12, iy: iy / 12 };
}

function polygonPerimeter(pts: Vec2[]): number {
  let p = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
    p += Math.sqrt(dx * dx + dy * dy);
  }
  return p;
}

// ─── Closed loop detection ───────────────────────────────────────────────────

function findClosedPolygons(entities: Record<EntityId, Entity>): Vec2[][] {
  // Build adjacency: pointId → [connected pointIds via lines]
  const adj = new Map<EntityId, EntityId[]>();

  for (const e of Object.values(entities)) {
    if (e.type !== 'line' || e.construction) continue;
    const ln = e as LineEntity;
    if (!adj.has(ln.p1Id)) adj.set(ln.p1Id, []);
    if (!adj.has(ln.p2Id)) adj.set(ln.p2Id, []);
    adj.get(ln.p1Id)!.push(ln.p2Id);
    adj.get(ln.p2Id)!.push(ln.p1Id);
  }

  const visited = new Set<EntityId>();
  const loops: Vec2[][] = [];

  for (const startId of adj.keys()) {
    if (visited.has(startId)) continue;

    // Find connected component by BFS
    const component: EntityId[] = [];
    const compSet = new Set<EntityId>();
    const queue = [startId];
    while (queue.length > 0) {
      const node = queue.pop()!;
      if (compSet.has(node)) continue;
      compSet.add(node);
      component.push(node);
      for (const nb of (adj.get(node) || [])) {
        if (!compSet.has(nb)) queue.push(nb);
      }
    }

    // Mark all visited regardless
    for (const id of component) visited.add(id);

    // Simple closed polygon: every node has degree exactly 2
    const isSimpleLoop = component.every(id => (adj.get(id) || []).length === 2);
    if (!isSimpleLoop || component.length < 3) continue;

    // Traverse loop in order
    const pts: Vec2[] = [];
    const seen = new Set<EntityId>();
    let cur = component[0];
    let prev: EntityId | null = null;

    while (!seen.has(cur)) {
      seen.add(cur);
      const pt = entities[cur] as PointEntity | undefined;
      if (pt && pt.type === 'point') pts.push({ x: pt.x, y: pt.y });
      const nbs = adj.get(cur) || [];
      const next = nbs.find(nb => nb !== prev && !seen.has(nb));
      if (!next) break;
      prev = cur;
      cur = next;
    }

    if (pts.length >= 3) loops.push(pts);
  }

  return loops;
}

// ─── Main analysis function ───────────────────────────────────────────────────

export function analyzeShapes(entities: Record<EntityId, Entity>): ShapeResult[] {
  const results: ShapeResult[] = [];

  // ── Closed polygons (from connected lines) ───────────────────────────────
  const polygons = findClosedPolygons(entities);
  polygons.forEach((pts, i) => {
    const signedArea = shoelaceArea(pts);
    const area = Math.abs(signedArea);
    if (area < 1e-6) return;

    // Ensure CCW winding for correct centroid/moment sign
    const orderedPts = signedArea < 0 ? [...pts].reverse() : pts;
    const centroid = polygonCentroid(orderedPts, Math.abs(shoelaceArea(orderedPts)));
    const { ix, iy } = polygonMomentsAboutOrigin(orderedPts);

    // Parallel axis theorem: centroidal moments
    const ixx = Math.abs(ix) - area * centroid.y * centroid.y;
    const iyy = Math.abs(iy) - area * centroid.x * centroid.x;
    const perimeter = polygonPerimeter(pts);

    results.push({
      id: `poly-${i}`,
      label: `Polygon (${pts.length}-sided)`,
      type: 'polygon',
      area,
      perimeter,
      centroid,
      ixx: Math.abs(ixx),
      iyy: Math.abs(iyy),
    });
  });

  // ── Circles ──────────────────────────────────────────────────────────────
  let circleIdx = 0;
  for (const e of Object.values(entities)) {
    if (e.type !== 'circle' || e.construction) continue;
    const circ = e as CircleEntity;
    const center = entities[circ.centerId] as PointEntity | undefined;
    if (!center) continue;
    const r = circ.radius;
    const area = Math.PI * r * r;
    const ixx = (Math.PI * r * r * r * r) / 4;

    results.push({
      id: `circ-${circleIdx++}`,
      label: `Circle`,
      type: 'circle',
      area,
      perimeter: 2 * Math.PI * r,
      centroid: { x: center.x, y: center.y },
      ixx,
      iyy: ixx, // I_xx = I_yy for circle
      radius: r,
    });
  }

  // ── Arcs (sector area + arc length) ─────────────────────────────────────
  let arcIdx = 0;
  for (const e of Object.values(entities)) {
    if (e.type !== 'arc' || e.construction) continue;
    const arc = e as ArcEntity;
    const center = entities[arc.centerId] as PointEntity | undefined;
    if (!center) continue;
    const r = arc.radius;
    let sweep = arc.endAngle - arc.startAngle;
    if (sweep <= 0) sweep += 2 * Math.PI;
    const midAngle = arc.startAngle + sweep / 2;
    const half = sweep / 2;

    // Sector centroid: distance = (2r/3) * sin(half) / half from center
    const dCent = half > 1e-6 ? (2 * r / 3) * Math.sin(half) / half : 0;
    const centroid: Vec2 = {
      x: center.x + dCent * Math.cos(midAngle),
      y: center.y + dCent * Math.sin(midAngle),
    };

    // Sector area
    const area = 0.5 * r * r * sweep;
    const arcLength = r * sweep;

    // Sector I about centroidal axes (via moments about circle center then parallel axis)
    // I_perp (about axis ⊥ to bisector, through circle center) = r⁴/8*(sweep - sin(sweep))
    // I_parallel (about bisector axis, through circle center) = r⁴/8*(sweep + sin(sweep))
    // Rotate to world x/y using mid-angle
    const iPerp = (r * r * r * r / 8) * (sweep - Math.sin(sweep));
    const iPara = (r * r * r * r / 8) * (sweep + Math.sin(sweep));
    const cos2 = Math.cos(midAngle) * Math.cos(midAngle);
    const sin2 = 1 - cos2;
    const iXcenter = iPara * sin2 + iPerp * cos2;
    const iYcenter = iPara * cos2 + iPerp * sin2;
    // Parallel axis to centroid
    const dx = dCent * Math.cos(midAngle);
    const dy = dCent * Math.sin(midAngle);
    const ixx = iXcenter - area * dy * dy;
    const iyy = iYcenter - area * dx * dx;

    results.push({
      id: `arc-${arcIdx++}`,
      label: `Arc sector`,
      type: 'arc',
      area,
      perimeter: arcLength,
      centroid,
      ixx: Math.abs(ixx),
      iyy: Math.abs(iyy),
      radius: r,
      sweepDeg: sweep * 180 / Math.PI,
    });
  }

  return results;
}

/** Totals across all shapes (area, Ixx, Iyy about global origin). */
export function totalProperties(shapes: ShapeResult[]): {
  totalArea: number;
  ixxOrigin: number;
  iyyOrigin: number;
} {
  let totalArea = 0, ixxO = 0, iyyO = 0;
  for (const s of shapes) {
    totalArea += s.area;
    // Parallel axis back to origin for combined Ixx/Iyy
    if (s.ixx !== null) ixxO += s.ixx + s.area * s.centroid.y * s.centroid.y;
    if (s.iyy !== null) iyyO += s.iyy + s.area * s.centroid.x * s.centroid.x;
  }
  return { totalArea, ixxOrigin: ixxO, iyyOrigin: iyyO };
}
