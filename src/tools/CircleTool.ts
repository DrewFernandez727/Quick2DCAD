import { Tool } from './types';
import { Vec2, EntityId, SnapResult, Entity } from '../geometry/types';
import { RenderState } from '../canvas/renderer';
import { useSketchStore } from '../state/sketchStore';
import { dist } from '../geometry/mathUtils';
import { autoConstrainPoint } from './autoConstraint';

export class CircleTool implements Tool {
  name = 'circle';

  private centerId: EntityId | null = null;
  private centerPt: Vec2 | null = null;
  private currentPt: Vec2 | null = null;

  onMouseDown(p: Vec2, e: MouseEvent, snap: SnapResult | null): void {
    const pt = snap ? snap.point : p;
    const store = useSketchStore.getState();

    if (!this.centerId) {
      store.pushHistory();
      this.centerId = store.addPoint(pt.x, pt.y);
      this.centerPt = pt;
      autoConstrainPoint(this.centerId, snap, e.altKey, store.entities, store.addConstraint);
    } else {
      // Place circle
      const radius = dist(this.centerPt!, pt);
      if (radius > 0.001) {
        store.addCircle(this.centerId, radius);
        (window as any).__triggerSolve?.();
      }
      this.centerId = null;
      this.centerPt = null;
      this.currentPt = null;
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
    if (this.centerId) {
      const store = useSketchStore.getState();
      store.deleteEntities([this.centerId]);
    }
    this.centerId = null;
    this.centerPt = null;
    this.currentPt = null;
  }

  getCursor(): string { return 'crosshair'; }

  getAnchor(): Vec2 | null { return this.centerPt; }

  getOverlay(): Partial<RenderState> {
    if (!this.centerPt || !this.currentPt || !this.centerId) return {};
    const radius = dist(this.centerPt, this.currentPt);
    if (radius < 0.001) return {};
    const previewCenter: Entity = { id: '__prev_c', type: 'point', x: this.centerPt.x, y: this.centerPt.y, construction: false };
    const previewCircle: Entity = { id: '__prev_ci', type: 'circle', centerId: '__prev_c', radius, construction: false };
    return {
      previewEntities: [previewCircle],
      previewPoints: [this.centerPt],
      liveLabel: { worldPos: this.currentPt, text: `R ${radius.toFixed(2)}mm  ⌀${(radius * 2).toFixed(2)}mm` },
    };
  }
}
