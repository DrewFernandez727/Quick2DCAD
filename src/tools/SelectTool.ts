import { Tool } from './types';
import { Vec2, EntityId, SnapResult, Entity, PointEntity, LineEntity, CircleEntity, ArcEntity } from '../geometry/types';
import { RenderState } from '../canvas/renderer';
import { useSketchStore } from '../state/sketchStore';
import { hitTestAll, boxSelect } from '../canvas/hitTest';

export class SelectTool implements Tool {
  name = 'select';

  private dragStart: Vec2 | null = null;
  private dragCurrent: Vec2 | null = null;
  private isDragging = false;
  private isMoving = false;
  private moveStart: Vec2 | null = null;
  private hasMoved = false;

  onMouseDown(p: Vec2, e: MouseEvent, snap: SnapResult | null): void {
    const store = useSketchStore.getState();
    const { entities, viewport, selectedIds } = store;

    const pt = snap ? snap.point : p;
    const hits = hitTestAll(pt, entities, viewport.zoom);
    const topHit = hits[0];

    if (topHit) {
      // If clicking a selected entity, start a move
      if (selectedIds.has(topHit)) {
        this.isMoving = true;
        this.moveStart = pt;
        this.hasMoved = false;
        store.pushHistory();
      } else {
        // Select it (shift = add to selection)
        if (e.shiftKey) {
          store.toggleSelect(topHit);
        } else {
          store.selectIds([topHit]);
          this.isMoving = true;
          this.moveStart = pt;
          this.hasMoved = false;
          store.pushHistory();
        }
      }
    } else {
      // Start box selection
      if (!e.shiftKey) store.clearSelection();
      this.dragStart = pt;
      this.dragCurrent = pt;
      this.isDragging = true;
    }
  }

  onMouseMove(p: Vec2, e: MouseEvent, snap: SnapResult | null): void {
    const pt = snap ? snap.point : p;

    if (this.isDragging) {
      this.dragCurrent = pt;
    }

    if (this.isMoving && this.moveStart) {
      const dx = pt.x - this.moveStart.x;
      const dy = pt.y - this.moveStart.y;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        const store = useSketchStore.getState();
        store.moveEntities(Array.from(store.selectedIds), dx, dy);
        store.updateReferenceDimensions();
        this.moveStart = pt;
        this.hasMoved = true;
      }
    }
  }

  onMouseUp(p: Vec2, e: MouseEvent, snap: SnapResult | null): void {
    const store = useSketchStore.getState();

    if (this.isDragging && this.dragStart && this.dragCurrent) {
      const ids = boxSelect(
        this.dragStart.x, this.dragStart.y,
        this.dragCurrent.x, this.dragCurrent.y,
        store.entities
      );
      if (e.shiftKey) {
        for (const id of ids) store.toggleSelect(id);
      } else {
        store.selectIds(ids);
      }
    }

    if (this.isMoving && this.hasMoved) {
      // History was already pushed at mousedown; trigger a re-solve
      (window as any).__triggerSolve?.();
    }

    this.dragStart = null;
    this.dragCurrent = null;
    this.isDragging = false;
    this.isMoving = false;
    this.moveStart = null;
  }

  onKeyDown(e: KeyboardEvent): void {
    const store = useSketchStore.getState();
    if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedIds.size > 0) {
      store.pushHistory();
      store.deleteEntities(Array.from(store.selectedIds));
    }
  }

  cancel(): void {
    this.dragStart = null;
    this.dragCurrent = null;
    this.isDragging = false;
    this.isMoving = false;
    this.moveStart = null;
  }

  getCursor(): string {
    return this.isMoving ? 'grabbing' : 'default';
  }

  getOverlay(): Partial<RenderState> {
    if (this.isDragging && this.dragStart && this.dragCurrent) {
      return {
        selectionBox: {
          x1: this.dragStart.x, y1: this.dragStart.y,
          x2: this.dragCurrent.x, y2: this.dragCurrent.y,
        }
      };
    }
    return {};
  }
}
