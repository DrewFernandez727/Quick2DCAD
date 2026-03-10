import { useEffect, useRef, useCallback } from 'react';
import { useSketchStore } from '../state/sketchStore';
import { render, screenToWorld, RenderState } from './renderer';
import { computeSnap } from '../geometry/snap';
import { solve, solveSimple } from '../solver/ConstraintSolver';
import { SelectTool } from '../tools/SelectTool';
import { LineTool } from '../tools/LineTool';
import { CircleTool } from '../tools/CircleTool';
import { ArcTool } from '../tools/ArcTool';
import { RectTool } from '../tools/RectTool';
import { PolygonTool } from '../tools/PolygonTool';
import { PointTool } from '../tools/PointTool';
import { Tool } from '../tools/types';
import type { Vec2, SnapResult } from '../geometry/types';

// ─── Tool instances ───────────────────────────────────────────────────────────
const tools: Record<string, Tool> = {
  select: new SelectTool(),
  line: new LineTool(),
  circle: new CircleTool(),
  arc: new ArcTool(),
  rect: new RectTool(),
  polygon: new PolygonTool(),
  point: new PointTool(),
};

// ─── Component ────────────────────────────────────────────────────────────────
export function SketchCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const isPanning = useRef(false);
  const lastPanPos = useRef<{ x: number; y: number } | null>(null);
  const isSpaceDown = useRef(false);

  const store = useSketchStore();

  // ─── Register global solve trigger ─────────────────────────────────────────
  useEffect(() => {
    (window as any).__triggerSolve = () => {
      try { solve(); } catch { solveSimple(); }
    };
    return () => { delete (window as any).__triggerSolve; };
  }, []);

  // ─── Render loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const activeTool = tools[store.activeTool];
    const overlay = activeTool?.getOverlay() ?? {};

    // Merge preview entities into a temporary entity map for the renderer
    const previewEntities = overlay.previewEntities ?? [];
    const previewEntityMap: Record<string, any> = {};
    for (const e of previewEntities) previewEntityMap[e.id] = e;

    const state: RenderState = {
      entities: { ...store.entities, ...previewEntityMap },
      constraints: store.constraints,
      viewport: store.viewport,
      selectedIds: store.selectedIds,
      overconstrained: store.overconstrained,
      snapResult: store.snapResult,
      gridSize: store.gridSize,
      showGrid: store.showGrid,
      previewPoints: overlay.previewPoints,
      previewEntities: overlay.previewEntities ?? [],
      selectionBox: overlay.selectionBox ?? null,
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
  const toWorldSnap = useCallback((screenX: number, screenY: number): { world: Vec2; snap: SnapResult } => {
    const canvas = canvasRef.current!;
    const w = canvas.width, h = canvas.height;
    const vp = useSketchStore.getState().viewport;
    const world = screenToWorld({ x: screenX, y: screenY }, vp, w, h);
    const { entities, snapOptions, gridSize } = useSketchStore.getState();
    const snap = computeSnap(world, entities, vp.zoom, gridSize, snapOptions);
    return { world, snap };
  }, []);

  // ─── Mouse events ─────────────────────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Pan with middle mouse or space+drag
    if (isPanning.current && lastPanPos.current) {
      const dx = sx - lastPanPos.current.x;
      const dy = sy - lastPanPos.current.y;
      useSketchStore.getState().panBy(dx, dy);
      lastPanPos.current = { x: sx, y: sy };
      return;
    }

    const { world, snap } = toWorldSnap(sx, sy);
    useSketchStore.getState().setSnapResult(snap);
    useSketchStore.getState().setCursorPos(world);

    const activeTool = tools[useSketchStore.getState().activeTool];
    activeTool?.onMouseMove(world, e.nativeEvent, snap);
  }, [toWorldSnap]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Middle mouse or space = pan
    if (e.button === 1 || isSpaceDown.current) {
      isPanning.current = true;
      lastPanPos.current = { x: sx, y: sy };
      return;
    }
    if (e.button !== 0) return;

    const { world, snap } = toWorldSnap(sx, sy);
    const activeTool = tools[useSketchStore.getState().activeTool];
    activeTool?.onMouseDown(world, e.nativeEvent, snap);
  }, [toWorldSnap]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) {
      isPanning.current = false;
      lastPanPos.current = null;
      return;
    }
    const rect = canvasRef.current!.getBoundingClientRect();
    const { world, snap } = toWorldSnap(e.clientX - rect.left, e.clientY - rect.top);
    const activeTool = tools[useSketchStore.getState().activeTool];
    activeTool?.onMouseUp(world, e.nativeEvent, snap);
  }, [toWorldSnap]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const canvas = canvasRef.current!;
    useSketchStore.getState().zoomAt(
      factor,
      e.clientX - rect.left,
      e.clientY - rect.top,
      canvas.width,
      canvas.height
    );
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Cancel current tool operation on right-click
    const activeTool = tools[useSketchStore.getState().activeTool];
    activeTool?.cancel();
  }, []);

  // ─── Keyboard events ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === ' ') { isSpaceDown.current = true; e.preventDefault(); return; }

      // Global shortcuts
      const store = useSketchStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); store.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); store.redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); store.selectIds(Object.keys(store.entities)); return; }
      if (e.key === 'Escape') {
        const t = tools[store.activeTool];
        t?.cancel();
        store.clearSelection();
        return;
      }

      // Tool shortcuts
      const toolKeys: Record<string, string> = {
        's': 'select', 'l': 'line', 'c': 'circle', 'a': 'arc', 'r': 'rect', 'p': 'point', 'g': 'polygon',
      };
      if (!e.ctrlKey && !e.metaKey && !e.altKey && toolKeys[e.key.toLowerCase()]) {
        const prev = tools[store.activeTool];
        prev?.cancel();
        store.setActiveTool(toolKeys[e.key.toLowerCase()] as any);
        return;
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const t = tools[store.activeTool];
        t?.onKeyDown(e);
        return;
      }

      // Forward to active tool
      const activeTool = tools[store.activeTool];
      activeTool?.onKeyDown(e);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') { isSpaceDown.current = false; isPanning.current = false; }
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
        onWheel={onWheel}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}
