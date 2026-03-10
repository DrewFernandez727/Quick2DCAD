import {
  Entity, EntityId, Vec2,
  PointEntity, LineEntity, CircleEntity, ArcEntity
} from '../geometry/types';
import {
  dist, distToSegment, circlePoint, angleInArc
} from '../geometry/mathUtils';

const HIT_TOLERANCE_PX = 8;

function ptFromMap(entities: Record<EntityId, Entity>, id: EntityId): Vec2 | null {
  const e = entities[id];
  if (!e || e.type !== 'point') return null;
  return { x: (e as PointEntity).x, y: (e as PointEntity).y };
}

/** Test if a world-space point p hits entity e, given zoom for px tolerance */
export function hitEntity(
  p: Vec2,
  e: Entity,
  entities: Record<EntityId, Entity>,
  zoom: number
): boolean {
  const tol = HIT_TOLERANCE_PX / zoom;

  switch (e.type) {
    case 'point': {
      return dist(p, { x: e.x, y: e.y }) <= tol * 1.5;
    }
    case 'line': {
      const p1 = ptFromMap(entities, e.p1Id);
      const p2 = ptFromMap(entities, e.p2Id);
      if (!p1 || !p2) return false;
      return distToSegment(p, p1, p2) <= tol;
    }
    case 'circle': {
      const center = ptFromMap(entities, e.centerId);
      if (!center) return false;
      return Math.abs(dist(p, center) - e.radius) <= tol;
    }
    case 'arc': {
      const center = ptFromMap(entities, (e as ArcEntity).centerId);
      if (!center) return false;
      const d = dist(p, center);
      if (Math.abs(d - e.radius) > tol) return false;
      const angle = Math.atan2(p.y - center.y, p.x - center.x);
      return angleInArc(angle, e.startAngle, e.endAngle);
    }
    default:
      return false;
  }
}

/** Return all entity IDs at world point, sorted (points first, then lines/curves) */
export function hitTestAll(
  p: Vec2,
  entities: Record<EntityId, Entity>,
  zoom: number
): EntityId[] {
  const hits: EntityId[] = [];
  for (const e of Object.values(entities)) {
    if (hitEntity(p, e, entities, zoom)) hits.push(e.id);
  }
  // Sort: points first (easiest to target)
  hits.sort((a, b) => {
    const ea = entities[a], eb = entities[b];
    const pa = ea.type === 'point' ? 0 : 1;
    const pb = eb.type === 'point' ? 0 : 1;
    return pa - pb;
  });
  return hits;
}

/** Box selection: entities whose bounding box overlaps with [x1,y1]x[x2,y2] */
export function boxSelect(
  x1: number, y1: number, x2: number, y2: number,
  entities: Record<EntityId, Entity>
): EntityId[] {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);

  const selected: EntityId[] = [];
  for (const e of Object.values(entities)) {
    if (entityInBox(e, entities, minX, minY, maxX, maxY)) {
      selected.push(e.id);
    }
  }
  return selected;
}

function entityInBox(
  e: Entity, entities: Record<EntityId, Entity>,
  minX: number, minY: number, maxX: number, maxY: number
): boolean {
  switch (e.type) {
    case 'point':
      return e.x >= minX && e.x <= maxX && e.y >= minY && e.y <= maxY;
    case 'line': {
      const p1 = ptFromMap(entities, e.p1Id);
      const p2 = ptFromMap(entities, e.p2Id);
      if (!p1 || !p2) return false;
      return (
        p1.x >= minX && p1.x <= maxX && p1.y >= minY && p1.y <= maxY &&
        p2.x >= minX && p2.x <= maxX && p2.y >= minY && p2.y <= maxY
      );
    }
    case 'circle':
    case 'arc': {
      const center = ptFromMap(entities, (e as CircleEntity | ArcEntity).centerId);
      if (!center) return false;
      return (
        center.x - e.radius >= minX && center.x + e.radius <= maxX &&
        center.y - e.radius >= minY && center.y + e.radius <= maxY
      );
    }
    default:
      return false;
  }
}
