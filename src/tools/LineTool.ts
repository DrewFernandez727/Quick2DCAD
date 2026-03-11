import { Tool } from './types';
import { Vec2, EntityId, SnapResult, Entity } from '../geometry/types';
import { RenderState } from '../canvas/renderer';
import { useSketchStore } from '../state/sketchStore';
import { dist } from '../geometry/mathUtils';
import { autoConstrainPoint, autoConstrainLineAngle } from './autoConstraint';

export class LineTool implements Tool {
  name = 'line';

  private startId: EntityId | null = null;
  private startPt: Vec2 | null = null;
  private currentPt: Vec2 | null = null;
  private chain = true;

  onMouseDown(p: Vec2, e: MouseEvent, snap: SnapResult | null): void {
    const pt = snap ? snap.point : p;
    const store = useSketchStore.getState();

    if (!this.startId) {
      store.pushHistory();
      let pid: EntityId;
      if (snap && snap.type === 'endpoint' && snap.entityId) {
        const existing = store.entities[snap.entityId];
        pid = (existing && existing.type === 'point') ? existing.id : store.addPoint(pt.x, pt.y);
      } else {
        pid = store.addPoint(pt.x, pt.y);
        autoConstrainPoint(pid, snap, e.altKey, store.entities, store.addConstraint);
      }
      this.startId = pid;
      this.startPt = pt;
    } else {
      let endId: EntityId;
      let freshEnd = false;
      if (snap && snap.type === 'endpoint' && snap.entityId) {
        const existing = store.entities[snap.entityId];
        endId = (existing && existing.type === 'point') ? existing.id : store.addPoint(pt.x, pt.y);
      } else {
        endId = store.addPoint(pt.x, pt.y);
        freshEnd = true;
      }

      const lineId = store.addLine(this.startId, endId);

      if (freshEnd) {
        autoConstrainPoint(endId, snap, e.altKey, store.entities, store.addConstraint);
      }
      if (this.startPt) {
        autoConstrainLineAngle(this.startPt, pt, lineId, e.altKey, store.addConstraint);
      }

      (window as any).__triggerSolve?.();

      if (this.chain) {
        this.startId = endId;
        this.startPt = pt;
      } else {
        this.startId = null;
        this.startPt = null;
      }
    }
  }

  onMouseMove(p: Vec2, _e: MouseEvent, snap: SnapResult | null): void {
    this.currentPt = snap ? snap.point : p;
  }

  onMouseUp(_p: Vec2, _e: MouseEvent, _snap: SnapResult | null): void {}

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.cancel();
  }

  cancel(): void {
    if (this.startId) {
      const store = useSketchStore.getState();
      const pt = store.entities[this.startId];
      if (pt && pt.type === 'point') {
        const usedByLine = Object.values(store.entities).some(
          e => e.type === 'line' && ((e as any).p1Id === this.startId || (e as any).p2Id === this.startId)
        );
        if (!usedByLine) store.deleteEntities([this.startId]);
      }
    }
    this.startId = null;
    this.startPt = null;
    this.currentPt = null;
  }

  getCursor(): string { return 'crosshair'; }

  getAnchor(): Vec2 | null { return this.startPt; }

  getOverlay(): Partial<RenderState> {
    if (!this.startPt || !this.currentPt) return {};
    const previewP1: Entity = { id: '__prev_p1', type: 'point', x: this.startPt.x, y: this.startPt.y, construction: false };
    const previewP2: Entity = { id: '__prev_p2', type: 'point', x: this.currentPt.x, y: this.currentPt.y, construction: false };
    const previewLine: Entity = { id: '__prev_ln', type: 'line', p1Id: '__prev_p1', p2Id: '__prev_p2', construction: false };
    const d = dist(this.startPt, this.currentPt);
    const angleDeg = Math.atan2(this.currentPt.y - this.startPt.y, this.currentPt.x - this.startPt.x) * 180 / Math.PI;
    return {
      previewEntities: [previewLine],
      previewPoints: [this.startPt, this.currentPt],
      liveLabel: { worldPos: this.currentPt, text: `${d.toFixed(2)}mm  ${angleDeg.toFixed(1)}°` },
    };
  }
}
