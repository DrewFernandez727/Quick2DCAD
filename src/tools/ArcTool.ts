import { Tool } from './types';
import { Vec2, EntityId, SnapResult, Entity, ArcEntity } from '../geometry/types';
import { RenderState } from '../canvas/renderer';
import { useSketchStore } from '../state/sketchStore';
import { dist, normalizeAngle } from '../geometry/mathUtils';

type ArcPhase = 'center' | 'radius' | 'start' | 'end';

export class ArcTool implements Tool {
  name = 'arc';

  private phase: ArcPhase = 'center';
  private centerId: EntityId | null = null;
  private centerPt: Vec2 | null = null;
  private radius = 0;
  private startAngle = 0;
  private currentPt: Vec2 | null = null;

  onMouseDown(p: Vec2, _e: MouseEvent, snap: SnapResult | null): void {
    const pt = snap ? snap.point : p;
    const store = useSketchStore.getState();

    if (this.phase === 'center') {
      store.pushHistory();
      this.centerId = store.addPoint(pt.x, pt.y);
      this.centerPt = pt;
      this.phase = 'radius';
    } else if (this.phase === 'radius') {
      this.radius = dist(this.centerPt!, pt);
      if (this.radius < 0.001) return;
      this.startAngle = Math.atan2(pt.y - this.centerPt!.y, pt.x - this.centerPt!.x);
      this.phase = 'end';
    } else if (this.phase === 'end') {
      const endAngle = Math.atan2(pt.y - this.centerPt!.y, pt.x - this.centerPt!.x);
      store.addArc(this.centerId!, this.radius, this.startAngle, endAngle);
      (window as any).__triggerSolve?.();
      this.reset();
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
    this.reset();
  }

  private reset() {
    this.phase = 'center';
    this.centerId = null;
    this.centerPt = null;
    this.radius = 0;
    this.startAngle = 0;
    this.currentPt = null;
  }

  getCursor(): string { return 'crosshair'; }

  getOverlay(): Partial<RenderState> {
    if (!this.centerPt || !this.currentPt) return {};

    const previewEntities: Entity[] = [];
    const previewPoints: Vec2[] = [this.centerPt];
    const centerEntity: Entity = {
      id: '__prev_arc_c', type: 'point',
      x: this.centerPt.x, y: this.centerPt.y, construction: false
    };

    if (this.phase === 'radius') {
      const r = dist(this.centerPt, this.currentPt);
      if (r > 0.001) {
        const circ: Entity = { id: '__prev_arc_ci', type: 'circle', centerId: '__prev_arc_c', radius: r, construction: false };
        previewEntities.push(circ);
      }
    } else if (this.phase === 'end' && this.radius > 0) {
      const endAngle = Math.atan2(
        this.currentPt.y - this.centerPt.y,
        this.currentPt.x - this.centerPt.x
      );
      const arc: Entity = {
        id: '__prev_arc', type: 'arc', centerId: '__prev_arc_c',
        radius: this.radius, startAngle: this.startAngle, endAngle, construction: false
      };
      previewEntities.push(arc);
    }

    if (previewEntities.length > 0) previewEntities.push(centerEntity);
    return { previewEntities, previewPoints };
  }
}
