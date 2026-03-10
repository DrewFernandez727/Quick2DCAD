/**
 * Geometric constraint solver using @salusoft89/planegcs (FreeCAD's GCS via WASM).
 * Falls back to a simple iterative relaxation solver if WASM is unavailable.
 */

import { useSketchStore } from '../state/sketchStore';
import {
  Entity, EntityId, SketchConstraint, ConstraintId,
  PointEntity, LineEntity, CircleEntity, ArcEntity
} from '../geometry/types';

// ─── Solver initialisation ────────────────────────────────────────────────────
let gcsWrapper: any = null;
let gcsReady = false;
const readyCallbacks: Array<() => void> = [];

export async function initSolver() {
  if (gcsReady) return;
  try {
    const mod = await import('@salusoft89/planegcs');
    gcsWrapper = await mod.make_gcs_wrapper();
    gcsReady = true;
    readyCallbacks.forEach(cb => cb());
    readyCallbacks.length = 0;
    console.log('[Solver] PlaneGCS ready');
  } catch (err) {
    console.warn('[Solver] PlaneGCS WASM unavailable, using fallback', err);
    gcsReady = true;
  }
}

export function onSolverReady(cb: () => void) {
  if (gcsReady) cb(); else readyCallbacks.push(cb);
}

// ─── Main solve using PlaneGCS ────────────────────────────────────────────────
export function solve() {
  if (!gcsWrapper) {
    solveSimple();
    return;
  }

  const store = useSketchStore.getState();
  const { entities, constraints, setSolveStatus, updateEntityFromSolver, updateCircleRadiusFromSolver } = store;

  const wrapper = gcsWrapper;
  wrapper.clear_data();

  // Map our EntityIds → planegcs string oids
  const idMap = new Map<EntityId, string>();
  let nextOid = 1;
  function gid(entityId: EntityId): string {
    if (!idMap.has(entityId)) idMap.set(entityId, String(nextOid++));
    return idMap.get(entityId)!;
  }

  const entityList = Object.values(entities);

  // Push all point entities
  for (const e of entityList) {
    if (e.type !== 'point') continue;
    const pt = e as PointEntity;
    wrapper.push_primitive({ id: gid(pt.id), type: 'point', x: pt.x, y: pt.y, fixed: false });
  }

  // Push lines, circles, arcs
  for (const e of entityList) {
    switch (e.type) {
      case 'line': {
        const l = e as LineEntity;
        wrapper.push_primitive({ id: gid(l.id), type: 'line', p1_id: gid(l.p1Id), p2_id: gid(l.p2Id) });
        break;
      }
      case 'circle': {
        const c = e as CircleEntity;
        wrapper.push_primitive({ id: gid(c.id), type: 'circle', c_id: gid(c.centerId), radius: c.radius });
        break;
      }
      case 'arc': {
        const a = e as ArcEntity;
        const center = entities[a.centerId] as PointEntity | undefined;
        const cx = center?.x ?? 0, cy = center?.y ?? 0;
        const startId = `__s_${a.id}`, endId = `__e_${a.id}`;
        wrapper.push_primitive({
          id: gid(startId), type: 'point',
          x: cx + a.radius * Math.cos(a.startAngle),
          y: cy + a.radius * Math.sin(a.startAngle),
          fixed: false,
        });
        wrapper.push_primitive({
          id: gid(endId), type: 'point',
          x: cx + a.radius * Math.cos(a.endAngle),
          y: cy + a.radius * Math.sin(a.endAngle),
          fixed: false,
        });
        wrapper.push_primitive({
          id: gid(a.id), type: 'arc',
          c_id: gid(a.centerId), radius: a.radius,
          start_id: gid(startId), end_id: gid(endId),
          start_angle: a.startAngle, end_angle: a.endAngle,
        });
        break;
      }
    }
  }

  // Helper: get gid for a point endpoint
  function ptGid(id: EntityId): string {
    const e = entities[id];
    if (!e) return gid(id);
    if (e.type === 'point') return gid(e.id);
    if (e.type === 'line') return gid((e as LineEntity).p1Id);
    if (e.type === 'circle' || e.type === 'arc') return gid((e as CircleEntity | ArcEntity).centerId);
    return gid(id);
  }

  // Push constraints
  let cidCounter = 100000;
  for (const c of Object.values(constraints)) {
    try {
      const cid = String(cidCounter++);
      addGcsConstraint(wrapper, cid, c, entities, gid, ptGid);
    } catch { /* ignore unsupported combinations */ }
  }

  // Solve
  wrapper.solve();
  wrapper.apply_solution();

  // Read back point positions
  for (const e of entityList) {
    if (e.type !== 'point') continue;
    const pt = e as PointEntity;
    try {
      const idx = wrapper.p_param_index.get(gid(pt.id));
      if (idx !== undefined) {
        const params = wrapper.get_gcs_params();
        updateEntityFromSolver(pt.id, params[idx], params[idx + 1]);
      }
    } catch {}
  }

  // Read back radii
  for (const e of entityList) {
    if (e.type !== 'circle' && e.type !== 'arc') continue;
    try {
      const updated = wrapper.sketch_index?.get_sketch_primitive?.(gid(e.id));
      if (updated?.radius > 0) updateCircleRadiusFromSolver(e.id, updated.radius);
    } catch {}
  }

  const hasConflict = wrapper.has_gcs_conflicting_constraints?.() ?? false;
  const hasRedundant = wrapper.has_gcs_redundant_constraints?.() ?? false;
  const status: 'ok' | 'redundant' | 'failed' = hasConflict ? 'failed' : hasRedundant ? 'redundant' : 'ok';
  setSolveStatus(status, new Set<ConstraintId>());
}

function addGcsConstraint(
  wrapper: any,
  cid: string,
  c: SketchConstraint,
  entities: Record<EntityId, Entity>,
  gid: (id: EntityId) => string,
  ptGid: (id: EntityId) => string
) {
  const { type, entityIds: ids, value, driving = true } = c;
  const e0 = entities[ids[0]], e1 = ids[1] ? entities[ids[1]] : undefined;

  const line = (e: Entity | undefined): LineEntity | undefined => e?.type === 'line' ? e as LineEntity : undefined;
  const circle = (e: Entity | undefined): CircleEntity | undefined => e?.type === 'circle' ? e as CircleEntity : undefined;
  const arc = (e: Entity | undefined): ArcEntity | undefined => e?.type === 'arc' ? e as ArcEntity : undefined;

  const push = (obj: Record<string, unknown>) => wrapper.push_primitive({ id: cid, driving, ...obj });

  switch (type) {
    case 'coincident':
      push({ type: 'p2p_coincident', p1_id: ptGid(ids[0]), p2_id: ptGid(ids[1]) });
      break;
    case 'horizontal':
      if (line(e0)) push({ type: 'horizontal_l', l_id: gid(ids[0]) });
      else push({ type: 'horizontal_pp', p1_id: ptGid(ids[0]), p2_id: ptGid(ids[1] ?? ids[0]) });
      break;
    case 'vertical':
      if (line(e0)) push({ type: 'vertical_l', l_id: gid(ids[0]) });
      else push({ type: 'vertical_pp', p1_id: ptGid(ids[0]), p2_id: ptGid(ids[1] ?? ids[0]) });
      break;
    case 'parallel':
      if (line(e0) && line(e1)) push({ type: 'parallel', l1_id: gid(ids[0]), l2_id: gid(ids[1]) });
      break;
    case 'perpendicular':
      if (line(e0) && line(e1)) push({ type: 'perpendicular_ll', l1_id: gid(ids[0]), l2_id: gid(ids[1]) });
      break;
    case 'tangent': {
      const l0 = line(e0), c0 = circle(e0), a0 = arc(e0);
      const l1 = line(e1), c1 = circle(e1), a1 = arc(e1);
      if (l0 && c1) push({ type: 'tangent_lc', l_id: gid(ids[0]), c_id: gid(ids[1]) });
      else if (c0 && l1) push({ type: 'tangent_lc', l_id: gid(ids[1]), c_id: gid(ids[0]) });
      else if (l0 && a1) push({ type: 'tangent_la', l_id: gid(ids[0]), a_id: gid(ids[1]) });
      else if (a0 && l1) push({ type: 'tangent_la', l_id: gid(ids[1]), a_id: gid(ids[0]) });
      else if (c0 && c1) push({ type: 'tangent_cc', c1_id: gid(ids[0]), c2_id: gid(ids[1]) });
      else if (a0 && a1) push({ type: 'tangent_aa', a1_id: gid(ids[0]), a2_id: gid(ids[1]) });
      break;
    }
    case 'equal':
      if (line(e0) && line(e1)) push({ type: 'equal_length', l1_id: gid(ids[0]), l2_id: gid(ids[1]) });
      else if ((circle(e0) || arc(e0)) && (circle(e1) || arc(e1))) push({ type: 'equal_radius_cc', c1_id: gid(ids[0]), c2_id: gid(ids[1]) });
      break;
    case 'concentric':
      if ((circle(e0) || arc(e0)) && (circle(e1) || arc(e1))) {
        const cid0 = (e0 as CircleEntity | ArcEntity).centerId;
        const cid1 = (e1 as CircleEntity | ArcEntity).centerId;
        push({ type: 'p2p_coincident', p1_id: gid(cid0), p2_id: gid(cid1) });
      }
      break;
    case 'midpoint':
      if (e0?.type === 'point' && line(e1))
        push({ type: 'midpoint_on_line_ll', l1_id: gid(ids[1]), l2_id: gid(ids[1]), p_id: gid(ids[0]) });
      break;
    case 'pointOnLine':
      if (e0?.type === 'point' && line(e1)) push({ type: 'point_on_line_pl', p_id: gid(ids[0]), l_id: gid(ids[1]) });
      break;
    case 'pointOnCircle':
      if (e0?.type === 'point' && circle(e1)) push({ type: 'point_on_circle', p_id: gid(ids[0]), c_id: gid(ids[1]) });
      break;
    case 'fixed':
      if (e0?.type === 'point') {
        const pt = e0 as PointEntity;
        push({ type: 'coordinate_x', p_id: gid(ids[0]), x: pt.x });
        wrapper.push_primitive({ id: cid + '_y', driving, type: 'coordinate_y', p_id: gid(ids[0]), y: pt.y });
      }
      break;
    case 'distance':
      if (value !== undefined) push({ type: 'p2p_distance', p1_id: ptGid(ids[0]), p2_id: ptGid(ids[1]), distance: value });
      break;
    case 'radius':
      if (value !== undefined) {
        if (circle(e0)) push({ type: 'circle_radius', c_id: gid(ids[0]), radius: value });
        else if (arc(e0)) push({ type: 'arc_radius', a_id: gid(ids[0]), radius: value });
      }
      break;
    case 'diameter':
      if (value !== undefined && circle(e0)) push({ type: 'circle_diameter', c_id: gid(ids[0]), diameter: value });
      break;
    case 'angle':
      if (value !== undefined && line(e0) && line(e1))
        push({ type: 'l2l_angle_ll', l1_id: gid(ids[0]), l2_id: gid(ids[1]), angle: value * Math.PI / 180 });
      break;
    case 'horizontalDistance':
      if (value !== undefined) push({ type: 'difference', param1: { o_id: ptGid(ids[1]), prop: 'x' }, param2: { o_id: ptGid(ids[0]), prop: 'x' }, difference: value });
      break;
    case 'verticalDistance':
      if (value !== undefined) push({ type: 'difference', param1: { o_id: ptGid(ids[1]), prop: 'y' }, param2: { o_id: ptGid(ids[0]), prop: 'y' }, difference: value });
      break;
    default:
      break;
  }
}

// ─── Simple fallback solver ───────────────────────────────────────────────────
// Iterative relaxation (Gauss-Seidel) for the most common constraints.
export function solveSimple() {
  const store = useSketchStore.getState();
  const { entities, constraints, setSolveStatus, updateEntityFromSolver } = store;

  const points = Object.values(entities).filter(e => e.type === 'point') as PointEntity[];
  const ptMap: Record<EntityId, { x: number; y: number }> = {};
  for (const pt of points) ptMap[pt.id] = { x: pt.x, y: pt.y };

  const MAX_ITER = 100;
  const TOL = 1e-8;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let maxErr = 0;
    for (const c of Object.values(constraints)) {
      const err = applySimple(c, ptMap, entities);
      maxErr = Math.max(maxErr, err);
    }
    if (maxErr < TOL) break;
  }

  for (const pt of points) {
    const p = ptMap[pt.id];
    if (p) updateEntityFromSolver(pt.id, p.x, p.y);
  }
  setSolveStatus('ok', new Set<ConstraintId>());
}

function resolvePoint(
  ptMap: Record<EntityId, { x: number; y: number }>,
  entities: Record<EntityId, Entity>,
  id: EntityId
): { x: number; y: number } | null {
  if (ptMap[id]) return ptMap[id];
  const e = entities[id];
  if (!e) return null;
  if (e.type === 'line') return ptMap[(e as LineEntity).p1Id] ?? null;
  if (e.type === 'circle' || e.type === 'arc') return ptMap[(e as CircleEntity | ArcEntity).centerId] ?? null;
  return null;
}

function applySimple(
  c: SketchConstraint,
  ptMap: Record<EntityId, { x: number; y: number }>,
  entities: Record<EntityId, Entity>
): number {
  const { type, entityIds: ids, value } = c;
  const α = 0.5;

  switch (type) {
    case 'coincident': {
      const p1 = resolvePoint(ptMap, entities, ids[0]);
      const p2 = resolvePoint(ptMap, entities, ids[1]);
      if (!p1 || !p2) return 0;
      const ex = p2.x - p1.x, ey = p2.y - p1.y;
      const err = Math.sqrt(ex * ex + ey * ey);
      if (err < 1e-12) return 0;
      p1.x += ex * α; p1.y += ey * α;
      p2.x -= ex * α; p2.y -= ey * α;
      return err;
    }
    case 'horizontal': {
      const e = entities[ids[0]];
      if (e?.type !== 'line') return 0;
      const p1 = ptMap[(e as LineEntity).p1Id], p2 = ptMap[(e as LineEntity).p2Id];
      if (!p1 || !p2) return 0;
      const err = Math.abs(p2.y - p1.y);
      const mid = (p1.y + p2.y) / 2;
      p1.y = mid; p2.y = mid;
      return err;
    }
    case 'vertical': {
      const e = entities[ids[0]];
      if (e?.type !== 'line') return 0;
      const p1 = ptMap[(e as LineEntity).p1Id], p2 = ptMap[(e as LineEntity).p2Id];
      if (!p1 || !p2) return 0;
      const err = Math.abs(p2.x - p1.x);
      const mid = (p1.x + p2.x) / 2;
      p1.x = mid; p2.x = mid;
      return err;
    }
    case 'fixed': {
      const e = entities[ids[0]];
      if (e?.type !== 'point') return 0;
      const p = ptMap[e.id];
      if (!p) return 0;
      const err = Math.hypot(p.x - (e as PointEntity).x, p.y - (e as PointEntity).y);
      p.x = (e as PointEntity).x; p.y = (e as PointEntity).y;
      return err;
    }
    case 'distance': {
      if (value === undefined) return 0;
      const p1 = resolvePoint(ptMap, entities, ids[0]);
      const p2 = resolvePoint(ptMap, entities, ids[1]);
      if (!p1 || !p2) return 0;
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-10) return 0;
      const err = d - value;
      const ux = dx / d, uy = dy / d;
      p1.x -= ux * err * α; p1.y -= uy * err * α;
      p2.x += ux * err * α; p2.y += uy * err * α;
      return Math.abs(err);
    }
    case 'parallel': {
      const l1 = entities[ids[0]], l2 = entities[ids[1]];
      if (l1?.type !== 'line' || l2?.type !== 'line') return 0;
      const a = ptMap[(l1 as LineEntity).p1Id], b = ptMap[(l1 as LineEntity).p2Id];
      const c = ptMap[(l2 as LineEntity).p1Id], d = ptMap[(l2 as LineEntity).p2Id];
      if (!a || !b || !c || !d) return 0;
      const dx1 = b.x - a.x, dy1 = b.y - a.y;
      const l = Math.hypot(dx1, dy1);
      if (l < 1e-10) return 0;
      const ux = dx1 / l, uy = dy1 / l;
      const dx2 = d.x - c.x, dy2 = d.y - c.y;
      const proj = dx2 * ux + dy2 * uy;
      const errX = dx2 - proj * ux, errY = dy2 - proj * uy;
      d.x -= errX * α; d.y -= errY * α;
      return Math.hypot(errX, errY);
    }
    default:
      return 0;
  }
}
