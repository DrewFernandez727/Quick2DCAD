import { Tool } from './types';
import { Vec2, SnapResult, Entity } from '../geometry/types';
import { RenderState } from '../canvas/renderer';
import { useSketchStore } from '../state/sketchStore';
import { formatLength } from '../geometry/units';

export class RectTool implements Tool {
  name = 'rect';

  private startPt: Vec2 | null = null;
  private currentPt: Vec2 | null = null;

  onMouseDown(p: Vec2, _e: MouseEvent, snap: SnapResult | null): void {
    const pt = snap ? snap.point : p;
    const store = useSketchStore.getState();

    if (!this.startPt) {
      store.pushHistory();
      this.startPt = pt;
    } else {
      store.addRect(this.startPt.x, this.startPt.y, pt.x, pt.y);
      (window as any).__triggerSolve?.();
      this.startPt = null;
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
    this.startPt = null;
    this.currentPt = null;
  }

  getCursor(): string { return 'crosshair'; }

  getOverlay(): Partial<RenderState> {
    if (!this.startPt || !this.currentPt) return {};
    const { x: x1, y: y1 } = this.startPt;
    const { x: x2, y: y2 } = this.currentPt;
    // Preview: 4 lines forming rectangle
    const p1: Entity = { id: '__rp1', type: 'point', x: x1, y: y1, construction: false };
    const p2: Entity = { id: '__rp2', type: 'point', x: x2, y: y1, construction: false };
    const p3: Entity = { id: '__rp3', type: 'point', x: x2, y: y2, construction: false };
    const p4: Entity = { id: '__rp4', type: 'point', x: x1, y: y2, construction: false };
    const lines: Entity[] = [
      { id: '__rl1', type: 'line', p1Id: '__rp1', p2Id: '__rp2', construction: false },
      { id: '__rl2', type: 'line', p1Id: '__rp2', p2Id: '__rp3', construction: false },
      { id: '__rl3', type: 'line', p1Id: '__rp3', p2Id: '__rp4', construction: false },
      { id: '__rl4', type: 'line', p1Id: '__rp4', p2Id: '__rp1', construction: false },
    ];
    const u = useSketchStore.getState().units;
    return {
      previewEntities: [p1, p2, p3, p4, ...lines],
      liveLabel: { worldPos: this.currentPt, text: `${formatLength(Math.abs(x2 - x1), u)} × ${formatLength(Math.abs(y2 - y1), u)}` },
    };
  }
}
