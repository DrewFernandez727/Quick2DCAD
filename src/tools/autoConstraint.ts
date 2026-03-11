/**
 * Auto-constraining helpers.
 * Called from drawing tools after placing a point or finalizing a line segment.
 * All helpers are no-ops when altKey is true.
 */

import type { EntityId, Entity, SnapResult, LineEntity, CircleEntity, ArcEntity, Vec2 } from '../geometry/types';
import type { SketchStore } from '../state/sketchStore';

const ANGLE_THRESHOLD = 2 * Math.PI / 180; // 2 degrees

/**
 * Auto-add a constraint based on the snap that was used to place the point.
 * - midpoint snap  → midpoint constraint
 * - center snap    → coincident with center point
 * - nearest on line → pointOnLine constraint
 * - nearest on circle/arc → pointOnCircle constraint
 * - endpoint snap  → nothing (point is already reused/merged)
 */
export function autoConstrainPoint(
  newPointId: EntityId,
  snap: SnapResult | null,
  altKey: boolean,
  entities: Record<EntityId, Entity>,
  addConstraint: SketchStore['addConstraint']
): void {
  if (altKey || !snap || !snap.entityId) return;

  const target = entities[snap.entityId];
  if (!target) return;

  switch (snap.type) {
    case 'midpoint': {
      if (target.type === 'line') {
        addConstraint({ type: 'midpoint', entityIds: [newPointId, target.id], driving: true });
      }
      break;
    }
    case 'center': {
      if (target.type === 'circle' || target.type === 'arc') {
        const centerId = (target as CircleEntity | ArcEntity).centerId;
        addConstraint({ type: 'coincident', entityIds: [newPointId, centerId], driving: true });
      }
      break;
    }
    case 'nearest': {
      if (target.type === 'line') {
        addConstraint({ type: 'pointOnLine', entityIds: [newPointId, target.id], driving: true });
      } else if (target.type === 'circle' || target.type === 'arc') {
        addConstraint({ type: 'pointOnCircle', entityIds: [newPointId, target.id], driving: true });
      }
      break;
    }
    // 'endpoint', 'intersection', 'grid', 'quadrant': no auto-constraint
    default:
      break;
  }
}

/**
 * After drawing a line, auto-add horizontal/vertical constraint if the line
 * is within ANGLE_THRESHOLD of an axis.
 */
export function autoConstrainLineAngle(
  p1: Vec2,
  p2: Vec2,
  lineId: EntityId,
  altKey: boolean,
  addConstraint: SketchStore['addConstraint']
): void {
  if (altKey) return;

  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return;

  const angle = Math.atan2(dy, dx); // −π to π

  // Near horizontal: angle ≈ 0 or ±π
  if (Math.abs(angle) < ANGLE_THRESHOLD || Math.abs(Math.abs(angle) - Math.PI) < ANGLE_THRESHOLD) {
    addConstraint({ type: 'horizontal', entityIds: [lineId], driving: true });
    return;
  }

  // Near vertical: angle ≈ ±π/2
  if (Math.abs(Math.abs(angle) - Math.PI / 2) < ANGLE_THRESHOLD) {
    addConstraint({ type: 'vertical', entityIds: [lineId], driving: true });
  }
}
