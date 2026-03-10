import { Tool } from './types';
import { Vec2, EntityId, SnapResult, Entity } from '../geometry/types';
import { RenderState } from '../canvas/renderer';
import { useSketchStore } from '../state/sketchStore';
import { newId } from '../geometry/idGen';

export class LineTool implements Tool {
  name = 'line';

  private startId: EntityId | null = null;
  private startPt: Vec2 | null = null;
  private currentPt: Vec2 | null = null;
  private chain = true; // chain lines end-to-end

  onMouseDown(p: Vec2, _e: MouseEvent, snap: SnapResult | null): void {
    const pt = snap ? snap.point : p;
    const store = useSketchStore.getState();

    if (!this.startId) {
      // First click — place start point
      store.pushHistory();
      let pid: EntityId;
      // Reuse an existing endpoint if snapping to one
      if (snap && snap.type === 'endpoint' && snap.entityId) {
        const existing = store.entities[snap.entityId];
        if (existing && existing.type === 'point') {
          pid = existing.id;
        } else {
          pid = store.addPoint(pt.x, pt.y);
        }
      } else {
        pid = store.addPoint(pt.x, pt.y);
      }
      this.startId = pid;
      this.startPt = pt;
    } else {
      // Second click — place end point and create line
      let endId: EntityId;
      if (snap && snap.type === 'endpoint' && snap.entityId) {
        const existing = store.entities[snap.entityId];
        if (existing && existing.type === 'point') {
          endId = existing.id;
        } else {
          endId = store.addPoint(pt.x, pt.y);
        }
      } else {
        endId = store.addPoint(pt.x, pt.y);
      }

      store.addLine(this.startId, endId);
      (window as any).__triggerSolve?.();

      if (this.chain) {
        // Continue chaining from the endpoint
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
    // If we have a dangling start point with no line, remove it
    if (this.startId) {
      const store = useSketchStore.getState();
      const pt = store.entities[this.startId];
      if (pt && pt.type === 'point') {
        // Check if this point is used by any line
        const usedByLine = Object.values(store.entities).some(
          e => e.type === 'line' && (e.p1Id === this.startId || e.p2Id === this.startId)
        );
        if (!usedByLine) store.deleteEntities([this.startId]);
      }
    }
    this.startId = null;
    this.startPt = null;
    this.currentPt = null;
  }

  getCursor(): string { return 'crosshair'; }

  getOverlay(): Partial<RenderState> {
    if (!this.startPt || !this.currentPt) return {};
    // Build a temporary preview line entity
    const previewP1: Entity = { id: '__prev_p1', type: 'point', x: this.startPt.x, y: this.startPt.y, construction: false };
    const previewP2: Entity = { id: '__prev_p2', type: 'point', x: this.currentPt.x, y: this.currentPt.y, construction: false };
    const previewLine: Entity = { id: '__prev_ln', type: 'line', p1Id: '__prev_p1', p2Id: '__prev_p2', construction: false };
    return {
      previewEntities: [previewLine],
      previewPoints: [this.startPt, this.currentPt],
    };
  }
}
