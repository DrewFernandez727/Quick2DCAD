import { Tool } from './types';
import { Vec2, SnapResult, Entity } from '../geometry/types';
import { RenderState } from '../canvas/renderer';
import { useSketchStore } from '../state/sketchStore';
import { dist } from '../geometry/mathUtils';

export class PolygonTool implements Tool {
  name = 'polygon';

  private centerPt: Vec2 | null = null;
  private currentPt: Vec2 | null = null;
  private sides = 6;

  onMouseDown(p: Vec2, _e: MouseEvent, snap: SnapResult | null): void {
    const pt = snap ? snap.point : p;
    const store = useSketchStore.getState();

    if (!this.centerPt) {
      store.pushHistory();
      this.centerPt = pt;
    } else {
      const r = dist(this.centerPt, pt);
      if (r < 0.001) return;
      const angle0 = Math.atan2(pt.y - this.centerPt.y, pt.x - this.centerPt.x);
      const cx = this.centerPt.x, cy = this.centerPt.y;
      const pts: string[] = [];
      for (let i = 0; i < this.sides; i++) {
        const a = angle0 + (2 * Math.PI * i) / this.sides;
        pts.push(store.addPoint(cx + r * Math.cos(a), cy + r * Math.sin(a)));
      }
      for (let i = 0; i < this.sides; i++) {
        store.addLine(pts[i], pts[(i + 1) % this.sides]);
      }
      (window as any).__triggerSolve?.();
      this.centerPt = null;
      this.currentPt = null;
    }
  }

  onMouseMove(p: Vec2, _e: MouseEvent, snap: SnapResult | null): void {
    this.currentPt = snap ? snap.point : p;
  }

  onMouseUp(_p: Vec2, _e: MouseEvent, _snap: SnapResult | null): void {}

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') { this.cancel(); return; }
    const n = parseInt(e.key);
    if (n >= 3 && n <= 9) this.sides = n;
  }

  cancel(): void {
    this.centerPt = null;
    this.currentPt = null;
  }

  getCursor(): string { return 'crosshair'; }

  getOverlay(): Partial<RenderState> {
    if (!this.centerPt || !this.currentPt) return {};
    const r = dist(this.centerPt, this.currentPt);
    if (r < 0.001) return {};
    const angle0 = Math.atan2(this.currentPt.y - this.centerPt.y, this.currentPt.x - this.centerPt.x);
    const cx = this.centerPt.x, cy = this.centerPt.y;
    const pts: Vec2[] = [];
    const previewEntities: Entity[] = [];
    for (let i = 0; i < this.sides; i++) {
      const a = angle0 + (2 * Math.PI * i) / this.sides;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      pts.push({ x, y });
      previewEntities.push({ id: `__pgp${i}`, type: 'point', x, y, construction: false });
    }
    for (let i = 0; i < this.sides; i++) {
      previewEntities.push({
        id: `__pgl${i}`, type: 'line',
        p1Id: `__pgp${i}`, p2Id: `__pgp${(i + 1) % this.sides}`, construction: false
      });
    }
    return { previewEntities, previewPoints: [this.centerPt] };
  }
}
