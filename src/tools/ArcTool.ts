import { Tool } from './types';
import { Vec2, EntityId, SnapResult, Entity } from '../geometry/types';
import { RenderState } from '../canvas/renderer';
import { useSketchStore } from '../state/sketchStore';
import { dist, midpoint, lineLineIntersection } from '../geometry/mathUtils';
import { formatLength } from '../geometry/units';

// ─── 3-point circumcircle ─────────────────────────────────────────────────────
function circumcircle(p1: Vec2, p2: Vec2, p3: Vec2): { cx: number; cy: number; r: number } | null {
  const m1 = midpoint(p1, p2);
  const m2 = midpoint(p2, p3);
  const d12 = { x: p2.x - p1.x, y: p2.y - p1.y };
  const d23 = { x: p3.x - p2.x, y: p3.y - p2.y };
  const b1p2 = { x: m1.x - d12.y, y: m1.y + d12.x };
  const b2p2 = { x: m2.x - d23.y, y: m2.y + d23.x };
  const center = lineLineIntersection(m1, b1p2, m2, b2p2);
  if (!center) return null;
  return { cx: center.x, cy: center.y, r: dist(center, p1) };
}

export class ArcTool implements Tool {
  name = 'arc';

  private phase = 0;
  private pts: Vec2[] = [];
  private ptIds: EntityId[] = [];
  private currentPt: Vec2 | null = null;

  private get mode(): 0 | 1 | 2 {
    return useSketchStore.getState().arcMode;
  }

  onMouseDown(p: Vec2, _e: MouseEvent, snap: SnapResult | null): void {
    const pt = snap ? snap.point : p;
    const store = useSketchStore.getState();
    if (this.phase === 0) store.pushHistory();

    if (this.mode === 0) this.handleMode0(pt, store);
    else if (this.mode === 1) this.handleMode1(pt, store);
    else this.handleMode2(pt, store);
  }

  // Mode 0: Center → Radius/StartAngle click → EndAngle click
  private handleMode0(pt: Vec2, store: ReturnType<typeof useSketchStore.getState>) {
    if (this.phase === 0) {
      this.ptIds = [store.addPoint(pt.x, pt.y)];
      this.pts = [pt];
      this.phase = 1;
    } else if (this.phase === 1) {
      if (dist(this.pts[0], pt) < 0.001) return;
      this.pts = [this.pts[0], pt];
      this.phase = 2;
    } else {
      const [center, radiusPt] = this.pts;
      const r = dist(center, radiusPt);
      store.addArc(this.ptIds[0], r, Math.atan2(radiusPt.y - center.y, radiusPt.x - center.x), Math.atan2(pt.y - center.y, pt.x - center.x));
      (window as any).__triggerSolve?.();
      this.reset();
    }
  }

  // Mode 1: Start → MidPoint on arc → End (3-point arc)
  private handleMode1(pt: Vec2, store: ReturnType<typeof useSketchStore.getState>) {
    if (this.phase === 0) {
      this.pts = [pt]; this.phase = 1;
    } else if (this.phase === 1) {
      this.pts = [this.pts[0], pt]; this.phase = 2;
    } else {
      const cc = circumcircle(this.pts[0], this.pts[1], pt);
      if (!cc) { this.reset(); return; }
      const centerId = store.addPoint(cc.cx, cc.cy);
      store.addArc(centerId, cc.r, Math.atan2(this.pts[0].y - cc.cy, this.pts[0].x - cc.cx), Math.atan2(pt.y - cc.cy, pt.x - cc.cx));
      (window as any).__triggerSolve?.();
      this.reset();
    }
  }

  // Mode 2: Start → Center → End
  private handleMode2(pt: Vec2, store: ReturnType<typeof useSketchStore.getState>) {
    if (this.phase === 0) {
      this.pts = [pt]; this.phase = 1;
    } else if (this.phase === 1) {
      if (dist(this.pts[0], pt) < 0.001) return;
      this.ptIds = [store.addPoint(pt.x, pt.y)];
      this.pts = [this.pts[0], pt];
      this.phase = 2;
    } else {
      const [start, center] = this.pts;
      const r = dist(center, start);
      store.addArc(this.ptIds[0], r, Math.atan2(start.y - center.y, start.x - center.x), Math.atan2(pt.y - center.y, pt.x - center.x));
      (window as any).__triggerSolve?.();
      this.reset();
    }
  }

  onMouseMove(p: Vec2, _e: MouseEvent, snap: SnapResult | null): void {
    this.currentPt = snap ? snap.point : p;
  }

  onMouseUp(_p: Vec2, _e: MouseEvent, _snap: SnapResult | null): void {}

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') { this.cancel(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const store = useSketchStore.getState();
      store.setArcMode(((store.arcMode + 1) % 3) as 0 | 1 | 2);
      this.reset();
    }
  }

  cancel(): void {
    if (this.ptIds.length > 0) useSketchStore.getState().deleteEntities(this.ptIds);
    this.reset();
  }

  private reset() { this.phase = 0; this.pts = []; this.ptIds = []; this.currentPt = null; }

  getCursor(): string { return 'crosshair'; }

  getAnchor(): Vec2 | null { return this.pts[0] ?? null; }

  getOverlay(): Partial<RenderState> {
    if (!this.currentPt || this.phase === 0) return {};
    const mode = this.mode;
    const u = useSketchStore.getState().units;
    const previewEntities: Entity[] = [];
    const previewPoints: Vec2[] = [...this.pts];
    let liveLabel: { worldPos: Vec2; text: string } | undefined;

    if (mode === 0) {
      const center = this.pts[0];
      const cEnt: Entity = { id: '__arc_c', type: 'point', x: center.x, y: center.y, construction: false };
      if (this.phase === 1) {
        const r = dist(center, this.currentPt);
        if (r > 0.001) {
          previewEntities.push({ id: '__arc_ci', type: 'circle', centerId: '__arc_c', radius: r, construction: false });
          liveLabel = { worldPos: this.currentPt, text: `R ${formatLength(r, u)}` };
        }
      } else {
        const r = dist(center, this.pts[1]);
        const sa = Math.atan2(this.pts[1].y - center.y, this.pts[1].x - center.x);
        const ea = Math.atan2(this.currentPt.y - center.y, this.currentPt.x - center.x);
        previewEntities.push({ id: '__arc_a', type: 'arc', centerId: '__arc_c', radius: r, startAngle: sa, endAngle: ea, construction: false });
        let sweep = (ea - sa) * 180 / Math.PI; if (sweep <= 0) sweep += 360;
        liveLabel = { worldPos: this.currentPt, text: `R ${formatLength(r, u)}  Δ${sweep.toFixed(1)}°` };
      }
      previewEntities.push(cEnt);
    } else if (mode === 1) {
      if (this.phase === 1) {
        const p1 = this.pts[0];
        previewEntities.push({ id: '__arc_p1', type: 'point', x: p1.x, y: p1.y, construction: false });
        previewEntities.push({ id: '__arc_p2', type: 'point', x: this.currentPt.x, y: this.currentPt.y, construction: false });
        previewEntities.push({ id: '__arc_l', type: 'line', p1Id: '__arc_p1', p2Id: '__arc_p2', construction: false });
        liveLabel = { worldPos: this.currentPt, text: `Click midpoint on arc` };
      } else {
        const cc = circumcircle(this.pts[0], this.pts[1], this.currentPt);
        if (cc) {
          const cEnt: Entity = { id: '__arc_c', type: 'point', x: cc.cx, y: cc.cy, construction: true };
          const sa = Math.atan2(this.pts[0].y - cc.cy, this.pts[0].x - cc.cx);
          const ea = Math.atan2(this.currentPt.y - cc.cy, this.currentPt.x - cc.cx);
          previewEntities.push(cEnt, { id: '__arc_a', type: 'arc', centerId: '__arc_c', radius: cc.r, startAngle: sa, endAngle: ea, construction: false });
          let sweep = (ea - sa) * 180 / Math.PI; if (sweep <= 0) sweep += 360;
          liveLabel = { worldPos: this.currentPt, text: `R ${formatLength(cc.r, u)}  Δ${sweep.toFixed(1)}°` };
        }
      }
    } else {
      if (this.phase === 1) {
        const start = this.pts[0];
        const r = dist(start, this.currentPt);
        previewEntities.push({ id: '__arc_p1', type: 'point', x: start.x, y: start.y, construction: false });
        previewEntities.push({ id: '__arc_p2', type: 'point', x: this.currentPt.x, y: this.currentPt.y, construction: false });
        previewEntities.push({ id: '__arc_l', type: 'line', p1Id: '__arc_p1', p2Id: '__arc_p2', construction: false });
        liveLabel = { worldPos: this.currentPt, text: `R ${formatLength(r, u)}` };
      } else {
        const [start, center] = this.pts;
        const r = dist(center, start);
        const cEnt: Entity = { id: '__arc_c', type: 'point', x: center.x, y: center.y, construction: false };
        const sa = Math.atan2(start.y - center.y, start.x - center.x);
        const ea = Math.atan2(this.currentPt.y - center.y, this.currentPt.x - center.x);
        previewEntities.push(cEnt, { id: '__arc_a', type: 'arc', centerId: '__arc_c', radius: r, startAngle: sa, endAngle: ea, construction: false });
        let sweep = (ea - sa) * 180 / Math.PI; if (sweep <= 0) sweep += 360;
        liveLabel = { worldPos: this.currentPt, text: `R ${formatLength(r, u)}  Δ${sweep.toFixed(1)}°` };
      }
    }

    return { previewEntities, previewPoints, liveLabel };
  }
}
