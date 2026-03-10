import {
  Vec2, EntityId, SnapResult, SnapType,
  Entity, PointEntity, LineEntity, CircleEntity, ArcEntity
} from './types';
import {
  dist, dist2, midpoint, sub, len, normalize, dot, add, scale,
  circlePoint, closestPointOnSegment, circleLineIntersections,
  circleCircleIntersections, lineLineIntersection, snapToGrid,
  distToSegment, angleInArc, normalizeAngle
} from './mathUtils';

const SNAP_RADIUS_PX = 12; // screen pixels

export interface SnapOptions {
  grid: boolean;
  endpoint: boolean;
  midpoint: boolean;
  center: boolean;
  quadrant: boolean;
  nearest: boolean;
  intersection: boolean;
}

export const DEFAULT_SNAP_OPTIONS: SnapOptions = {
  grid: true,
  endpoint: true,
  midpoint: true,
  center: true,
  quadrant: true,
  nearest: true,
  intersection: true,
};

// Helper to get point coordinates from entity map
function getPoint(entities: Record<EntityId, Entity>, id: EntityId): Vec2 | null {
  const e = entities[id];
  if (!e || e.type !== 'point') return null;
  return { x: (e as PointEntity).x, y: (e as PointEntity).y };
}

export function computeSnap(
  cursor: Vec2,           // world coords
  entities: Record<EntityId, Entity>,
  zoom: number,
  gridSize: number,
  options: SnapOptions,
  excludeIds: EntityId[] = []
): SnapResult {
  const snapRadiusWorld = SNAP_RADIUS_PX / zoom;
  const snapR2 = snapRadiusWorld * snapRadiusWorld;

  let best: SnapResult | null = null;
  let bestPriority = 999;
  let bestDist2 = Infinity;

  function candidate(r: SnapResult, priority: number) {
    const d2 = dist2(cursor, r.point);
    if (d2 > snapR2) return;
    if (priority < bestPriority || (priority === bestPriority && d2 < bestDist2)) {
      best = r;
      bestPriority = priority;
      bestDist2 = d2;
    }
  }

  const entityList = Object.values(entities).filter(
    e => !excludeIds.includes(e.id)
  );

  // Endpoint and center snaps (highest priority)
  for (const e of entityList) {
    if (e.type === 'point' && options.endpoint) {
      const p = { x: e.x, y: e.y };
      candidate({ point: p, type: 'endpoint', entityId: e.id }, 1);
    }
    if (e.type === 'circle' && options.center) {
      const center = getPoint(entities, e.centerId);
      if (center) candidate({ point: center, type: 'center', entityId: e.id }, 2);
    }
    if (e.type === 'arc' && options.center) {
      const center = getPoint(entities, e.centerId);
      if (center) candidate({ point: center, type: 'center', entityId: e.id }, 2);
    }
  }

  // Midpoint snaps
  if (options.midpoint) {
    for (const e of entityList) {
      if (e.type === 'line') {
        const p1 = getPoint(entities, e.p1Id);
        const p2 = getPoint(entities, e.p2Id);
        if (p1 && p2) {
          const mp = midpoint(p1, p2);
          candidate({ point: mp, type: 'midpoint', entityId: e.id }, 3);
        }
      }
    }
  }

  // Quadrant snaps (0°, 90°, 180°, 270° on circles/arcs)
  if (options.quadrant) {
    for (const e of entityList) {
      if (e.type === 'circle' || e.type === 'arc') {
        const center = getPoint(entities, (e as CircleEntity | ArcEntity).centerId);
        const r = e.radius;
        if (center) {
          const angles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
          for (const a of angles) {
            if (e.type === 'arc' && !angleInArc(a, e.startAngle, e.endAngle)) continue;
            const qp = circlePoint(center, r, a);
            candidate({ point: qp, type: 'quadrant', entityId: e.id }, 4);
          }
        }
      }
    }
  }

  // Intersection snaps
  if (options.intersection) {
    const lines: LineEntity[] = entityList.filter(e => e.type === 'line') as LineEntity[];
    const circles: (CircleEntity | ArcEntity)[] = entityList.filter(
      e => e.type === 'circle' || e.type === 'arc'
    ) as (CircleEntity | ArcEntity)[];

    // Line-line intersections
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const p1 = getPoint(entities, lines[i].p1Id);
        const p2 = getPoint(entities, lines[i].p2Id);
        const p3 = getPoint(entities, lines[j].p1Id);
        const p4 = getPoint(entities, lines[j].p2Id);
        if (!p1 || !p2 || !p3 || !p4) continue;
        const ix = lineLineIntersection(p1, p2, p3, p4);
        if (ix) candidate({ point: ix, type: 'intersection', entityId: lines[i].id, entityId2: lines[j].id }, 0);
      }
    }

    // Circle/arc-line intersections
    for (const c of circles) {
      const center = getPoint(entities, c.centerId);
      if (!center) continue;
      for (const l of lines) {
        const p1 = getPoint(entities, l.p1Id);
        const p2 = getPoint(entities, l.p2Id);
        if (!p1 || !p2) continue;
        for (const ix of circleLineIntersections(center, c.radius, p1, p2)) {
          candidate({ point: ix, type: 'intersection', entityId: c.id, entityId2: l.id }, 0);
        }
      }
    }

    // Circle-circle intersections
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const c1 = getPoint(entities, circles[i].centerId);
        const c2 = getPoint(entities, circles[j].centerId);
        if (!c1 || !c2) continue;
        for (const ix of circleCircleIntersections(c1, circles[i].radius, c2, circles[j].radius)) {
          candidate({ point: ix, type: 'intersection', entityId: circles[i].id, entityId2: circles[j].id }, 0);
        }
      }
    }
  }

  // Nearest-on-entity snap
  if (options.nearest && !best) {
    for (const e of entityList) {
      if (e.type === 'line') {
        const p1 = getPoint(entities, e.p1Id);
        const p2 = getPoint(entities, e.p2Id);
        if (!p1 || !p2) continue;
        const np = closestPointOnSegment(cursor, p1, p2);
        candidate({ point: np, type: 'nearest', entityId: e.id }, 6);
      }
      if (e.type === 'circle' || e.type === 'arc') {
        const center = getPoint(entities, (e as CircleEntity | ArcEntity).centerId);
        if (!center) continue;
        const d = dist(cursor, center);
        if (d === 0) continue;
        const angle = Math.atan2(cursor.y - center.y, cursor.x - center.x);
        if (e.type === 'arc' && !angleInArc(angle, e.startAngle, e.endAngle)) continue;
        const np = circlePoint(center, e.radius, angle);
        candidate({ point: np, type: 'nearest', entityId: e.id }, 6);
      }
    }
  }

  if (best) return best;

  // Grid snap fallback
  if (options.grid) {
    return {
      point: { x: snapToGrid(cursor.x, gridSize), y: snapToGrid(cursor.y, gridSize) },
      type: 'grid'
    };
  }

  return { point: cursor, type: 'grid' };
}
