import { Tool } from './types';
import { Vec2, EntityId, SnapResult, Entity, LineEntity, CircleEntity, PointEntity } from '../geometry/types';
import { RenderState } from '../canvas/renderer';
import { useSketchStore } from '../state/sketchStore';
import { lineLineIntersection, circleLineIntersections, distToSegment } from '../geometry/mathUtils';

interface TrimSegment {
  lineId: EntityId;
  t0: number;
  t1: number;
}

export class TrimTool implements Tool {
  name = 'trim';

  private trimSeg: TrimSegment | null = null;

  onMouseDown(_p: Vec2, _e: MouseEvent, _snap: SnapResult | null): void {
    if (!this.trimSeg) return;
    const store = useSketchStore.getState();
    store.pushHistory();
    store.splitLineAtParams(this.trimSeg.lineId, this.trimSeg.t0, this.trimSeg.t1);
    this.trimSeg = null;
    (window as any).__triggerSolve?.();
  }

  onMouseMove(p: Vec2, _e: MouseEvent, _snap: SnapResult | null): void {
    this.trimSeg = this._findTrimSegment(p);
  }

  onMouseUp(_p: Vec2, _e: MouseEvent, _snap: SnapResult | null): void {}

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.trimSeg = null;
  }

  cancel(): void {
    this.trimSeg = null;
  }

  getCursor(): string { return 'crosshair'; }

  getOverlay(): Partial<RenderState> {
    if (!this.trimSeg) return {};
    const store = useSketchStore.getState();
    const line = store.entities[this.trimSeg.lineId] as LineEntity | undefined;
    if (!line || line.type !== 'line') return {};
    const p1 = store.entities[line.p1Id] as PointEntity | undefined;
    const p2 = store.entities[line.p2Id] as PointEntity | undefined;
    if (!p1 || !p2) return {};

    const sx = p1.x + this.trimSeg.t0 * (p2.x - p1.x);
    const sy = p1.y + this.trimSeg.t0 * (p2.y - p1.y);
    const ex = p1.x + this.trimSeg.t1 * (p2.x - p1.x);
    const ey = p1.y + this.trimSeg.t1 * (p2.y - p1.y);

    const tp1: Entity = { id: '__trim_p1', type: 'point', x: sx, y: sy, construction: false };
    const tp2: Entity = { id: '__trim_p2', type: 'point', x: ex, y: ey, construction: false };
    const tln: Entity = { id: '__trim_ln', type: 'line', p1Id: '__trim_p1', p2Id: '__trim_p2', construction: false };
    return { previewEntities: [tp1, tp2, tln] };
  }

  private _findTrimSegment(cursor: Vec2): TrimSegment | null {
    const store = useSketchStore.getState();
    const { entities, viewport } = store;
    const hitDist = 8 / viewport.zoom; // ~8px in world coords

    let bestLine: LineEntity | null = null;
    let bestDist = hitDist;

    for (const e of Object.values(entities)) {
      if (e.type !== 'line') continue;
      const ln = e as LineEntity;
      const q1 = entities[ln.p1Id] as PointEntity | undefined;
      const q2 = entities[ln.p2Id] as PointEntity | undefined;
      if (!q1 || !q2) continue;
      const d = distToSegment(cursor, { x: q1.x, y: q1.y }, { x: q2.x, y: q2.y });
      if (d < bestDist) { bestDist = d; bestLine = ln; }
    }

    if (!bestLine) return null;

    const line = bestLine;
    const p1 = entities[line.p1Id] as PointEntity;
    const p2 = entities[line.p2Id] as PointEntity;
    const lx = p2.x - p1.x, ly = p2.y - p1.y;
    const len2 = lx * lx + ly * ly;
    if (len2 < 0.0001) return null;

    const tCursor = Math.max(0, Math.min(1, ((cursor.x - p1.x) * lx + (cursor.y - p1.y) * ly) / len2));
    const tValues: number[] = [0, 1];

    for (const e of Object.values(entities)) {
      if (e.id === line.id) continue;

      if (e.type === 'line') {
        const other = e as LineEntity;
        const q1 = entities[other.p1Id] as PointEntity | undefined;
        const q2 = entities[other.p2Id] as PointEntity | undefined;
        if (!q1 || !q2) continue;
        const pt = lineLineIntersection(
          { x: p1.x, y: p1.y }, { x: p2.x, y: p2.y },
          { x: q1.x, y: q1.y }, { x: q2.x, y: q2.y }
        );
        if (pt) {
          const t = Math.abs(lx) > Math.abs(ly) ? (pt.x - p1.x) / lx : (pt.y - p1.y) / ly;
          // Only count intersection if it falls within the other segment too
          const qx = q2.x - q1.x, qy = q2.y - q1.y;
          const len2q = qx * qx + qy * qy;
          const tOther = len2q > 0.0001
            ? (Math.abs(qx) > Math.abs(qy) ? (pt.x - q1.x) / qx : (pt.y - q1.y) / qy)
            : 0;
          if (t > 0.001 && t < 0.999 && tOther >= -0.001 && tOther <= 1.001) tValues.push(t);
        }
      } else if (e.type === 'circle') {
        const circ = e as CircleEntity;
        const center = entities[circ.centerId] as PointEntity | undefined;
        if (!center) continue;
        const pts = circleLineIntersections(
          { x: center.x, y: center.y }, circ.radius,
          { x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }
        );
        for (const pt of pts) {
          const t = Math.abs(lx) > Math.abs(ly) ? (pt.x - p1.x) / lx : (pt.y - p1.y) / ly;
          if (t > 0.001 && t < 0.999) tValues.push(t);
        }
      }
    }

    tValues.sort((a, b) => a - b);

    for (let i = 0; i < tValues.length - 1; i++) {
      if (tCursor >= tValues[i] && tCursor <= tValues[i + 1]) {
        return { lineId: line.id, t0: tValues[i], t1: tValues[i + 1] };
      }
    }
    return null;
  }
}
