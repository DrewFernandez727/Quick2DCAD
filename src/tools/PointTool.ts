import { Tool } from './types';
import { Vec2, SnapResult } from '../geometry/types';
import { RenderState } from '../canvas/renderer';
import { useSketchStore } from '../state/sketchStore';

export class PointTool implements Tool {
  name = 'point';

  onMouseDown(p: Vec2, _e: MouseEvent, snap: SnapResult | null): void {
    const pt = snap ? snap.point : p;
    const store = useSketchStore.getState();
    store.pushHistory();
    store.addPoint(pt.x, pt.y);
    (window as any).__triggerSolve?.();
  }

  onMouseMove(_p: Vec2, _e: MouseEvent, _snap: SnapResult | null): void {}
  onMouseUp(_p: Vec2, _e: MouseEvent, _snap: SnapResult | null): void {}
  onKeyDown(e: KeyboardEvent): void { if (e.key === 'Escape') this.cancel(); }
  cancel(): void {}
  getCursor(): string { return 'crosshair'; }
  getOverlay(): Partial<RenderState> { return {}; }
}
