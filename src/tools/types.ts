import { Vec2, EntityId, SnapResult } from '../geometry/types';
import { RenderState } from '../canvas/renderer';

export interface ToolContext {
  canvasWidth: number;
  canvasHeight: number;
}

export interface Tool {
  name: string;
  onMouseDown(p: Vec2, e: MouseEvent, snap: SnapResult | null): void;
  onMouseMove(p: Vec2, e: MouseEvent, snap: SnapResult | null): void;
  onMouseUp(p: Vec2, e: MouseEvent, snap: SnapResult | null): void;
  onKeyDown(e: KeyboardEvent): void;
  cancel(): void;
  getCursor(): string;
  /** Overlay state for the renderer (preview geometry, selection box, live label, etc.) */
  getOverlay(): Partial<RenderState>;
  /** Returns the anchor point for ortho lock (last placed point). */
  getAnchor?(): Vec2 | null;
}
