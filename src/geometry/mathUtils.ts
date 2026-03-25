import { Vec2, Entity, EntityId, SketchConstraint, PointEntity, LineEntity, CircleEntity, ArcEntity } from './types';

// ─── Dimension measurement helpers ───────────────────────────────────────────

export function getEntityPoint(e: Entity, entities: Record<EntityId, Entity>): Vec2 | null {
  if (e.type === 'point') return { x: (e as PointEntity).x, y: (e as PointEntity).y };
  if (e.type === 'line') {
    const p1 = entities[(e as LineEntity).p1Id] as PointEntity | undefined;
    const p2 = entities[(e as LineEntity).p2Id] as PointEntity | undefined;
    if (p1 && p2) return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }
  if (e.type === 'circle' || e.type === 'arc') {
    const c = entities[(e as CircleEntity | ArcEntity).centerId] as PointEntity | undefined;
    if (c) return { x: c.x, y: c.y };
  }
  return null;
}

export function measureConstraintValue(
  c: Pick<SketchConstraint, 'type' | 'entityIds'>,
  entities: Record<EntityId, Entity>,
): number | null {
  const { type, entityIds } = c;
  switch (type) {
    case 'distance': {
      const p1 = entityIds[0] ? getEntityPoint(entities[entityIds[0]], entities) : null;
      const p2 = entityIds[1] ? getEntityPoint(entities[entityIds[1]], entities) : null;
      if (!p1 || !p2) return null;
      return dist(p1, p2);
    }
    case 'horizontalDistance': {
      const p1 = entityIds[0] ? getEntityPoint(entities[entityIds[0]], entities) : null;
      const p2 = entityIds[1] ? getEntityPoint(entities[entityIds[1]], entities) : null;
      if (!p1 || !p2) return null;
      return Math.abs(p2.x - p1.x);
    }
    case 'verticalDistance': {
      const p1 = entityIds[0] ? getEntityPoint(entities[entityIds[0]], entities) : null;
      const p2 = entityIds[1] ? getEntityPoint(entities[entityIds[1]], entities) : null;
      if (!p1 || !p2) return null;
      return Math.abs(p2.y - p1.y);
    }
    case 'radius': {
      const e = entities[entityIds[0]];
      if (e?.type === 'circle' || e?.type === 'arc') return (e as CircleEntity | ArcEntity).radius;
      return null;
    }
    case 'diameter': {
      const e = entities[entityIds[0]];
      if (e?.type === 'circle') return (e as CircleEntity).radius * 2;
      return null;
    }
    case 'angle': {
      const l1 = entities[entityIds[0]] as LineEntity | undefined;
      const l2 = entities[entityIds[1]] as LineEntity | undefined;
      if (!l1 || l1.type !== 'line' || !l2 || l2.type !== 'line') return null;
      const a = entities[l1.p1Id] as PointEntity | undefined;
      const b = entities[l1.p2Id] as PointEntity | undefined;
      const c = entities[l2.p1Id] as PointEntity | undefined;
      const d = entities[l2.p2Id] as PointEntity | undefined;
      if (!a || !b || !c || !d) return null;
      const ang1 = Math.atan2(b.y - a.y, b.x - a.x);
      const ang2 = Math.atan2(d.y - c.y, d.x - c.x);
      let deg = Math.abs(ang1 - ang2) * 180 / Math.PI;
      if (deg > 180) deg = 360 - deg;
      return deg;
    }
    default:
      return null;
  }
}

export function vec(x: number, y: number): Vec2 { return { x, y }; }

export function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
export function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
export function scale(v: Vec2, s: number): Vec2 { return { x: v.x * s, y: v.y * s }; }
export function dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }
export function cross(a: Vec2, b: Vec2): number { return a.x * b.y - a.y * b.x; }
export function len(v: Vec2): number { return Math.sqrt(v.x * v.x + v.y * v.y); }
export function len2(v: Vec2): number { return v.x * v.x + v.y * v.y; }
export function normalize(v: Vec2): Vec2 { const l = len(v); return l === 0 ? { x: 0, y: 0 } : scale(v, 1 / l); }
export function perp(v: Vec2): Vec2 { return { x: -v.y, y: v.x }; }
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
export function midpoint(a: Vec2, b: Vec2): Vec2 { return lerp(a, b, 0.5); }
export function dist(a: Vec2, b: Vec2): number { return len(sub(b, a)); }
export function dist2(a: Vec2, b: Vec2): number { return len2(sub(b, a)); }

export function angle(a: Vec2, b: Vec2): number { return Math.atan2(b.y - a.y, b.x - a.x); }
export function angleDeg(a: Vec2, b: Vec2): number { return (angle(a, b) * 180) / Math.PI; }

/** Signed angle from vector a to vector b (in radians, -π..π) */
export function signedAngle(a: Vec2, b: Vec2): number {
  return Math.atan2(cross(a, b), dot(a, b));
}

/** Closest point on line segment (p1,p2) to point p */
export function closestPointOnSegment(p: Vec2, p1: Vec2, p2: Vec2): Vec2 {
  const d = sub(p2, p1);
  const l2 = len2(d);
  if (l2 === 0) return p1;
  const t = Math.max(0, Math.min(1, dot(sub(p, p1), d) / l2));
  return add(p1, scale(d, t));
}

/** Distance from point p to infinite line through p1,p2 */
export function distToLine(p: Vec2, p1: Vec2, p2: Vec2): number {
  const d = sub(p2, p1);
  const l = len(d);
  if (l === 0) return dist(p, p1);
  return Math.abs(cross(d, sub(p, p1))) / l;
}

/** Distance from point p to line segment */
export function distToSegment(p: Vec2, p1: Vec2, p2: Vec2): number {
  return dist(p, closestPointOnSegment(p, p1, p2));
}

/** Line-line intersection (infinite lines). Returns null if parallel. */
export function lineLineIntersection(
  p1: Vec2, p2: Vec2,
  p3: Vec2, p4: Vec2
): Vec2 | null {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const c = cross(d1, d2);
  if (Math.abs(c) < 1e-10) return null;
  const t = cross(sub(p3, p1), d2) / c;
  return add(p1, scale(d1, t));
}

/** Circle-line intersections */
export function circleLineIntersections(
  center: Vec2, radius: number,
  p1: Vec2, p2: Vec2
): Vec2[] {
  const d = sub(p2, p1);
  const f = sub(p1, center);
  const a = dot(d, d);
  const b = 2 * dot(f, d);
  const c = dot(f, f) - radius * radius;
  let discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  discriminant = Math.sqrt(discriminant);
  const t1 = (-b - discriminant) / (2 * a);
  const t2 = (-b + discriminant) / (2 * a);
  const results: Vec2[] = [];
  for (const t of [t1, t2]) {
    if (t >= 0 && t <= 1) results.push(add(p1, scale(d, t)));
  }
  return results;
}

/** Circle-circle intersections */
export function circleCircleIntersections(
  c1: Vec2, r1: number,
  c2: Vec2, r2: number
): Vec2[] {
  const d = dist(c1, c2);
  if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(r1 * r1 - a * a);
  const mid = add(c1, scale(normalize(sub(c2, c1)), a));
  const perp2 = scale(perp(normalize(sub(c2, c1))), h);
  return [add(mid, perp2), sub(mid, perp2)];
}

/** Normalise angle to [0, 2π) */
export function normalizeAngle(a: number): number {
  a = a % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
}

/** Is angle θ in the arc from startAngle to endAngle (CCW)? */
export function angleInArc(θ: number, startAngle: number, endAngle: number): boolean {
  θ = normalizeAngle(θ);
  startAngle = normalizeAngle(startAngle);
  endAngle = normalizeAngle(endAngle);
  if (startAngle <= endAngle) return θ >= startAngle && θ <= endAngle;
  return θ >= startAngle || θ <= endAngle;
}

/** Get a point on a circle at angle θ */
export function circlePoint(center: Vec2, radius: number, angle: number): Vec2 {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

/** Round to given decimal places */
export function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

/** Snap value to grid */
export function snapToGrid(v: number, grid: number): number {
  return Math.round(v / grid) * grid;
}
