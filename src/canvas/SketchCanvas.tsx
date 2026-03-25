import { useEffect, useRef, useCallback } from 'react';
import { useSketchStore } from '../state/sketchStore';
import { render, screenToWorld, RenderState, queryDimLabelAt } from './renderer';
import { computeSnap } from '../geometry/snap';
import { solve, solveSimple } from '../solver/ConstraintSolver';
import { SelectTool } from '../tools/SelectTool';
import { LineTool } from '../tools/LineTool';
import { CircleTool } from '../tools/CircleTool';
import { ArcTool } from '../tools/ArcTool';
import { RectTool } from '../tools/RectTool';
import { PolygonTool } from '../tools/PolygonTool';
import { PointTool } from '../tools/PointTool';
import { TrimTool } from '../tools/TrimTool';
import { DimensionTool } from '../tools/DimensionTool';
import { Tool } from '../tools/types';
import type { Vec2, SnapResult } from '../geometry/types';
import { hitTestAll } from './hitTest';
import { applyConstraintToIds } from '../components/ConstraintBar';

// ─── Tool instances ───────────────────────────────────────────────────────────
const tools: Record<string, Tool> = {
  select: new SelectTool(),
  line: new LineTool(),
  circle: new CircleTool(),
  arc: new ArcTool(),
  rect: new RectTool(),
  polygon: new PolygonTool(),
  point: new PointTool(),
  trim: new TrimTool(),
  dim: new DimensionTool(),
};

// ─── Ortho lock helper ────────────────────────────────────────────────────────
function applyOrthoLock(raw: Vec2, anchor: Vec2): Vec2 {
  const dx = raw.x - anchor.x, dy = raw.y - anchor.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-10) return raw;
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4); // nearest 45°
  return { x: anchor.x + d * Math.cos(snapped), y: anchor.y + d * Math.sin(snapped) };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function SketchCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const isPanning = useRef(false);
  const lastPanPos = useRef<{ x: number; y: number } | null>(null);
  const isSpaceDown = useRef(false);
  const isShiftDown = useRef(false);

  const store = useSketchStore();

  // ─── Register globals ────────────────────────────────────────────────────────
  useEffect(() => {
    (window as any).__triggerSolve = () => {
      try { solve(); } catch { solveSimple(); }
      useSketchStore.getState().updateReferenceDimensions();
    };
    (window as any).__cancelActiveTool = () => {
      const s = useSketchStore.getState();
      tools[s.activeTool]?.cancel();
    };
    return () => {
      delete (window as any).__triggerSolve;
      delete (window as any).__cancelActiveTool;
    };
  }, []);

  // ─── Render loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const activeTool = tools[store.activeTool];
    const overlay = activeTool?.getOverlay() ?? {};

    const previewEntities = overlay.previewEntities ?? [];
    const previewEntityMap: Record<string, any> = {};
    for (const e of previewEntities) previewEntityMap[e.id] = e;

    // Build orthoLock visual from shift state + tool anchor + current cursor
    let orthoLock: RenderState['orthoLock'] = null;
    if (isShiftDown.current) {
      const anchor = activeTool?.getAnchor?.() ?? null;
      if (anchor && store.cursorPos) {
        const locked = applyOrthoLock(store.cursorPos, anchor);
        orthoLock = { anchor, lockedPoint: locked };
      }
    }

    const state: RenderState = {
      entities: { ...store.entities, ...previewEntityMap },
      constraints: store.constraints,
      viewport: store.viewport,
      selectedIds: store.selectedIds,
      overconstrained: store.overconstrained,
      snapResult: store.snapResult,
      gridSize: store.gridSize,
      showGrid: store.showGrid && store.snapOptions.grid,
      units: store.units,
      selectedConstraintId: store.selectedConstraintId,
      previewPoints: overlay.previewPoints,
      previewEntities: overlay.previewEntities ?? [],
      selectionBox: overlay.selectionBox ?? null,
      liveLabel: (overlay as any).liveLabel ?? null,
      dimPreview: (overlay as any).dimPreview ?? null,
      highlightIds: (overlay as any).highlightIds,
      orthoLock,
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => render(ctx, state));
    return () => cancelAnimationFrame(rafRef.current);
  });

  // ─── Canvas resize ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ro = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    });
    ro.observe(container);
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    return () => ro.disconnect();
  }, []);

  // ─── Screen → world + snap helper ─────────────────────────────────────────
  const toWorldSnap = useCallback((screenX: number, screenY: number, shiftLock = false): { world: Vec2; snap: SnapResult | null } => {
    const canvas = canvasRef.current!;
    const w = canvas.width, h = canvas.height;
    const vp = useSketchStore.getState().viewport;
    let world = screenToWorld({ x: screenX, y: screenY }, vp, w, h);
    const { entities, snapOptions, gridSize, showGrid, activeTool } = useSketchStore.getState();

    // Apply ortho lock before snapping if shift is held
    if (shiftLock) {
      const anchor = tools[activeTool]?.getAnchor?.() ?? null;
      if (anchor) world = applyOrthoLock(world, anchor);
    }

    // Grid snap only fires when the grid is visible
    const effectiveSnap = { ...snapOptions, grid: snapOptions.grid && showGrid };
    const snap = computeSnap(world, entities, vp.zoom, gridSize, effectiveSnap);
    return { world, snap };
  }, []);

  // ─── Mouse events ─────────────────────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (isPanning.current && lastPanPos.current) {
      const dx = sx - lastPanPos.current.x;
      const dy = sy - lastPanPos.current.y;
      useSketchStore.getState().panBy(dx, dy);
      lastPanPos.current = { x: sx, y: sy };
      return;
    }

    const { world, snap } = toWorldSnap(sx, sy, isShiftDown.current);

    // Update ortho active state
    const { activeTool } = useSketchStore.getState();
    const hasAnchor = tools[activeTool]?.getAnchor?.() != null;
    useSketchStore.getState().setOrthoActive(isShiftDown.current && hasAnchor);

    useSketchStore.getState().setSnapResult(snap);
    useSketchStore.getState().setCursorPos(world);

    const tool = tools[activeTool];
    tool?.onMouseMove(world, e.nativeEvent, snap);
  }, [toWorldSnap]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (e.button === 1 || isSpaceDown.current) {
      isPanning.current = true;
      lastPanPos.current = { x: sx, y: sy };
      return;
    }
    if (e.button !== 0) return;

    const { world, snap } = toWorldSnap(sx, sy, isShiftDown.current);
    const store = useSketchStore.getState();

    // ── Constraint picking mode ───────────────────────────────────────────────
    const { pendingConstraint } = store;
    if (pendingConstraint) {
      const hits = hitTestAll(world, store.entities, store.viewport.zoom);
      const topHit = hits[0];
      if (topHit) {
        const { type, minEntities, collectedIds } = pendingConstraint;
        const newIds = [...collectedIds, topHit];
        store.selectIds(newIds);
        if (newIds.length >= minEntities) {
          applyConstraintToIds(type, newIds);
          // Reset for next pick — loop until Esc
          store.setPendingConstraint({ type, minEntities });
        } else {
          useSketchStore.setState(s => { if (s.pendingConstraint) s.pendingConstraint.collectedIds = newIds; });
        }
      }
      return; // don't forward to tool
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Dim label click-to-select (select tool only) ──────────────────────────
    if (store.activeTool === 'select') {
      const hitCid = queryDimLabelAt(sx, sy);
      if (hitCid) {
        store.selectConstraint(hitCid);
        return;
      }
      // Clicked empty space (not a dim label) → clear constraint selection
      store.selectConstraint(null);
    }

    const activeTool = tools[store.activeTool];
    activeTool?.onMouseDown(world, e.nativeEvent, snap);
  }, [toWorldSnap]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) {
      isPanning.current = false;
      lastPanPos.current = null;
      return;
    }
    const rect = canvasRef.current!.getBoundingClientRect();
    const { world, snap } = toWorldSnap(e.clientX - rect.left, e.clientY - rect.top, isShiftDown.current);
    const activeTool = tools[useSketchStore.getState().activeTool];
    activeTool?.onMouseUp(world, e.nativeEvent, snap);
  }, [toWorldSnap]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.4 : 1 / 1.4;
    const canvas = canvasRef.current!;
    useSketchStore.getState().zoomAt(
      factor,
      e.clientX - rect.left,
      e.clientY - rect.top,
      canvas.width,
      canvas.height
    );
  }, []);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hitCid = queryDimLabelAt(sx, sy);
    if (hitCid) {
      const s = useSketchStore.getState();
      const c = s.constraints[hitCid];
      if (c?.value !== undefined) {
        s.openDimensionDialog(hitCid, c.value);
      }
    }
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const activeTool = tools[useSketchStore.getState().activeTool];
    activeTool?.cancel();
  }, []);

  // ─── Keyboard events ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === ' ') { isSpaceDown.current = true; e.preventDefault(); return; }
      if (e.key === 'Shift') { isShiftDown.current = true; return; }

      // Global shortcuts
      const store = useSketchStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); store.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); store.redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); store.selectIds(Object.keys(store.entities)); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        useSketchStore.setState(s => ({ showGrid: !s.showGrid }));
        return;
      }

      // Fit to view (F key)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (canvas) {
          const { entities, selectedIds } = store;
          const ids = selectedIds.size > 0 ? Array.from(selectedIds) : Object.keys(entities);
          store.fitView(ids, canvas.width, canvas.height);
        }
        return;
      }

      if (e.key === 'Escape') {
        store.setPendingConstraint(null);
        const t = tools[store.activeTool];
        t?.cancel();
        store.clearSelection();
        store.setActiveTool('select');
        return;
      }

      // Tool shortcuts
      const toolKeys: Record<string, string> = {
        's': 'select', 'l': 'line', 'c': 'circle', 'a': 'arc',
        'r': 'rect', 'p': 'point', 'g': 'polygon', 't': 'trim', 'd': 'dim',
      };
      if (!e.ctrlKey && !e.metaKey && !e.altKey && toolKeys[e.key.toLowerCase()]) {
        const prev = tools[store.activeTool];
        prev?.cancel();
        store.setPendingConstraint(null);
        store.setActiveTool(toolKeys[e.key.toLowerCase()] as any);
        return;
      }

      // Delete — remove selected constraint or selected entities
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.selectedConstraintId) {
          store.pushHistory();
          store.removeConstraint(store.selectedConstraintId);
          store.selectConstraint(null);
          return;
        }
        const t = tools[store.activeTool];
        t?.onKeyDown(e);
        return;
      }

      // Enter — edit selected dimension
      if (e.key === 'Enter' && store.selectedConstraintId) {
        const c = store.constraints[store.selectedConstraintId];
        if (c?.value !== undefined) store.openDimensionDialog(store.selectedConstraintId, c.value);
        return;
      }

      // Forward to active tool
      const activeTool = tools[store.activeTool];
      activeTool?.onKeyDown(e);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') { isSpaceDown.current = false; isPanning.current = false; }
      if (e.key === 'Shift') {
        isShiftDown.current = false;
        useSketchStore.getState().setOrthoActive(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: isPanning.current ? 'grabbing' : (tools[store.activeTool]?.getCursor() ?? 'default') }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}
