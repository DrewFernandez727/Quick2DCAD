import { Tool } from './types';
import {
  Vec2, EntityId, SnapResult, Entity,
  PointEntity, LineEntity, CircleEntity, ArcEntity,
} from '../geometry/types';
import { RenderState } from '../canvas/renderer';
import { useSketchStore } from '../state/sketchStore';
import { hitTestAll } from '../canvas/hitTest';
import { dist } from '../geometry/mathUtils';

export type DimMode = 'smart' | 'linear' | 'horizontal' | 'vertical' | 'angle' | 'radius' | 'diameter';

type ResolvedDimType =
  | 'distance'
  | 'horizontalDistance'
  | 'verticalDistance'
  | 'angle'
  | 'radius'
  | 'diameter';

// ─── Measurement helpers ──────────────────────────────────────────────────────

function getEntityPoint(e: Entity, entities: Record<EntityId, Entity>): Vec2 | null {
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

function measureValue(
  type: ResolvedDimType,
  entityIds: EntityId[],
  entities: Record<EntityId, Entity>,
): number | null {
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

// ─── DimensionTool ────────────────────────────────────────────────────────────

export class DimensionTool implements Tool {
  name = 'dim';

  private get mode(): DimMode {
    return useSketchStore.getState().dimMode;
  }

  private phase: 'pick1' | 'pick2' | 'place' = 'pick1';
  private picked1: EntityId | null = null;
  private picked2: EntityId | null = null;
  private resolvedType: ResolvedDimType | null = null;
  private resolvedIds: EntityId[] = []; // expanded entity IDs for the constraint
  private mouse: Vec2 | null = null;
  private hoverEntity: EntityId | null = null;

  // ── Phase helpers ──────────────────────────────────────────────────────────

  private resolveType(e1: Entity, e2?: Entity): ResolvedDimType | null {
    const m = this.mode;
    if (m === 'horizontal') return 'horizontalDistance';
    if (m === 'vertical') return 'verticalDistance';
    if (m === 'angle') return e1.type === 'line' && e2?.type === 'line' ? 'angle' : null;
    if (m === 'radius') return (e1.type === 'circle' || e1.type === 'arc') ? 'radius' : null;
    if (m === 'diameter') return e1.type === 'circle' ? 'diameter' : null;

    // smart / linear
    if (!e2) {
      if (e1.type === 'circle') return 'diameter';
      if (e1.type === 'arc') return 'radius';
      if (e1.type === 'line') return 'distance'; // full line length
      return null; // point — needs pick2
    }
    if (e1.type === 'line' && e2.type === 'line') return 'angle';
    return 'distance'; // any two entities → distance between representative points
  }

  /** True if one pick is sufficient for this mode + entity */
  private needsPick2(e: Entity): boolean {
    const m = this.mode;
    if (m === 'radius' || m === 'diameter') return false;
    if (m === 'angle') return true;
    // smart / linear
    if (e.type === 'circle' || e.type === 'arc') return false;
    if (e.type === 'line') return false; // line length: use its endpoints
    return true; // single point: need second pick
  }

  /**
   * Expand picked entities to the IDs the constraint solver expects.
   * distance/h/v: 2 point IDs
   * angle: 2 line IDs
   * radius/diameter: 1 circle/arc ID
   */
  private expandIds(
    type: ResolvedDimType,
    e1: Entity,
    e2: Entity | undefined,
    entities: Record<EntityId, Entity>,
  ): EntityId[] {
    if (type === 'radius' || type === 'diameter') return [e1.id];
    if (type === 'angle') return e2 ? [e1.id, e2.id] : [e1.id];

    // linear — need two points
    function toPoint(e: Entity): EntityId[] {
      if (e.type === 'point') return [e.id];
      if (e.type === 'line') return [(e as LineEntity).p1Id, (e as LineEntity).p2Id];
      if (e.type === 'circle' || e.type === 'arc')
        return [(e as CircleEntity | ArcEntity).centerId];
      return [e.id];
    }

    if (!e2) {
      // single line → its two endpoints
      return toPoint(e1).slice(0, 2);
    }

    // e1 → first point, e2 → second point
    const pts1 = toPoint(e1);
    const pts2 = toPoint(e2);
    return [pts1[0], pts2[0]];
  }

  // ── Tool interface ─────────────────────────────────────────────────────────

  onMouseMove(p: Vec2, _e: MouseEvent, snap: SnapResult | null): void {
    this.mouse = snap?.point ?? p;
    if (this.phase === 'pick1' || this.phase === 'pick2') {
      const store = useSketchStore.getState();
      const hits = hitTestAll(this.mouse, store.entities, store.viewport.zoom);
      this.hoverEntity = hits[0] ?? null;
    }
  }

  onMouseDown(p: Vec2, _e: MouseEvent, snap: SnapResult | null): void {
    const pt = snap?.point ?? p;
    const store = useSketchStore.getState();

    if (this.phase === 'pick1') {
      const hits = hitTestAll(pt, store.entities, store.viewport.zoom);
      if (!hits[0]) return;
      const e1 = store.entities[hits[0]];
      if (!e1) return;

      this.picked1 = hits[0];

      if (!this.needsPick2(e1)) {
        const type = this.resolveType(e1);
        if (!type) { this.picked1 = null; return; }
        this.resolvedType = type;
        this.resolvedIds = this.expandIds(type, e1, undefined, store.entities);
        this.phase = 'place';
      } else {
        this.phase = 'pick2';
      }

    } else if (this.phase === 'pick2') {
      const hits = hitTestAll(pt, store.entities, store.viewport.zoom);
      // Prefer entities other than picked1 (but allow re-clicking same entity for single-line dim)
      const hit = hits.find(id => id !== this.picked1) ?? hits[0] ?? null;
      if (!hit) return;

      const e1 = store.entities[this.picked1!]!;
      const e2 = store.entities[hit]!;
      const type = this.resolveType(e1, e2);
      if (!type) return;

      this.picked2 = hit;
      this.resolvedType = type;
      this.resolvedIds = this.expandIds(type, e1, e2, store.entities);
      this.phase = 'place';

    } else if (this.phase === 'place') {
      this.place(this.mouse ?? pt, store);
    }
  }

  private place(labelPos: Vec2, store: ReturnType<typeof useSketchStore.getState>) {
    if (!this.resolvedType || !this.resolvedIds.length) return;

    const measured = measureValue(this.resolvedType, this.resolvedIds, store.entities);

    store.pushHistory();
    const id = store.addConstraint({
      type: this.resolvedType,
      entityIds: this.resolvedIds,
      driving: true,
      value: undefined,
      labelPos,
    });
    store.openDimensionDialog(id, measured ?? undefined);

    // Reset for next placement (keep mode, loop from pick1)
    this.phase = 'pick1';
    this.picked1 = null;
    this.picked2 = null;
    this.resolvedType = null;
    this.resolvedIds = [];
    this.hoverEntity = null;
  }

  onMouseUp(_p: Vec2, _e: MouseEvent, _snap: SnapResult | null): void {}

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.cancel();
  }

  cancel(): void {
    this.phase = 'pick1';
    this.picked1 = null;
    this.picked2 = null;
    this.resolvedType = null;
    this.resolvedIds = [];
    this.hoverEntity = null;
  }

  getCursor(): string { return 'crosshair'; }
  getAnchor(): Vec2 | null { return null; }

  getOverlay(): Partial<RenderState> {
    const store = useSketchStore.getState();
    const highlightIds = new Set<EntityId>();
    if (this.picked1) highlightIds.add(this.picked1);
    if (this.picked2) highlightIds.add(this.picked2);
    if (this.hoverEntity) highlightIds.add(this.hoverEntity);

    if (this.phase === 'place' && this.resolvedType && this.resolvedIds.length && this.mouse) {
      // Live measured value for the label
      const val = measureValue(this.resolvedType, this.resolvedIds, store.entities);
      const labelText = val !== null
        ? (this.resolvedType === 'angle' ? `${val.toFixed(1)}°` : `${val.toFixed(2)}`)
        : '';

      return {
        dimPreview: {
          type: this.resolvedType,
          entityIds: this.resolvedIds,
          labelPos: this.mouse,
          labelText,
        },
        highlightIds,
      } as any;
    }

    if (highlightIds.size > 0) return { highlightIds } as any;
    return {};
  }
}
