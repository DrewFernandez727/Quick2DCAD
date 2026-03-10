import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  Entity, EntityId, SketchConstraint, ConstraintId,
  Viewport, ToolName, SnapResult, Vec2, SketchState,
  PointEntity, LineEntity, CircleEntity, ArcEntity
} from '../geometry/types';
import { newId } from '../geometry/idGen';
import { SnapOptions, DEFAULT_SNAP_OPTIONS } from '../geometry/snap';

// ─── History ──────────────────────────────────────────────────────────────────
const MAX_HISTORY = 100;

interface HistoryEntry {
  entities: Record<EntityId, Entity>;
  constraints: Record<ConstraintId, SketchConstraint>;
}

// ─── Store shape ──────────────────────────────────────────────────────────────
export interface SketchStore {
  // Sketch data
  entities: Record<EntityId, Entity>;
  constraints: Record<ConstraintId, SketchConstraint>;

  // Viewport
  viewport: Viewport;

  // Tool
  activeTool: ToolName;

  // Selection
  selectedIds: Set<EntityId>;

  // Snap
  snapOptions: SnapOptions;
  snapResult: SnapResult | null;
  gridSize: number;
  showGrid: boolean;

  // Constraint solve status
  solveStatus: 'ok' | 'redundant' | 'failed';
  overconstrained: Set<ConstraintId>;

  // Cursor world position
  cursorPos: Vec2;

  // Dimension dialog
  dimensionDialog: { open: boolean; constraintId: ConstraintId | null; value: string };

  // History
  _history: HistoryEntry[];
  _historyIndex: number;

  // ─── Actions ────────────────────────────────────────────────────────────────
  // Viewport
  setViewport(v: Viewport): void;
  panBy(dx: number, dy: number): void;
  zoomAt(factor: number, screenX: number, screenY: number, canvasW: number, canvasH: number): void;
  resetView(): void;

  // Tool
  setActiveTool(tool: ToolName): void;

  // Selection
  selectIds(ids: EntityId[]): void;
  toggleSelect(id: EntityId): void;
  clearSelection(): void;

  // Snap
  setSnapResult(r: SnapResult | null): void;
  setSnapOptions(o: Partial<SnapOptions>): void;
  setCursorPos(p: Vec2): void;

  // Entity mutations
  addPoint(x: number, y: number, construction?: boolean): EntityId;
  addLine(p1Id: EntityId, p2Id: EntityId, construction?: boolean): EntityId;
  addCircle(centerId: EntityId, radius: number, construction?: boolean): EntityId;
  addArc(centerId: EntityId, radius: number, startAngle: number, endAngle: number, construction?: boolean): EntityId;
  addRect(x1: number, y1: number, x2: number, y2: number, construction?: boolean): EntityId[];
  movePoint(id: EntityId, x: number, y: number): void;
  moveEntities(ids: EntityId[], dx: number, dy: number): void;
  deleteEntities(ids: EntityId[]): void;
  toggleConstruction(id: EntityId): void;
  updateRadius(id: EntityId, radius: number): void;
  updateArcAngles(id: EntityId, startAngle: number, endAngle: number): void;

  // Constraints
  addConstraint(c: Omit<SketchConstraint, 'id'>): ConstraintId;
  removeConstraint(id: ConstraintId): void;
  setSolveStatus(status: 'ok' | 'redundant' | 'failed', overconstrained: Set<ConstraintId>): void;
  updateEntityFromSolver(id: EntityId, x: number, y: number): void;
  updateCircleRadiusFromSolver(id: EntityId, radius: number): void;
  updateDimensionConstraintValue(id: ConstraintId, value: number): void;

  // Dimension dialog
  openDimensionDialog(constraintId: ConstraintId | null, initialValue?: number): void;
  closeDimensionDialog(): void;

  // History
  pushHistory(): void;
  undo(): void;
  redo(): void;

  // Save/load
  exportSketch(): string;
  importSketch(json: string): void;
  clearSketch(): void;
}

// ─── Helper to deep-clone sketch state ───────────────────────────────────────
function cloneSketch(
  entities: Record<EntityId, Entity>,
  constraints: Record<ConstraintId, SketchConstraint>
): HistoryEntry {
  return {
    entities: JSON.parse(JSON.stringify(entities)),
    constraints: JSON.parse(JSON.stringify(constraints)),
  };
}

// ─── Store implementation ────────────────────────────────────────────────────
export const useSketchStore = create<SketchStore>()(
  immer((set, get) => ({
    entities: {},
    constraints: {},
    viewport: { panX: 0, panY: 0, zoom: 50 }, // 50px per unit (1 unit = 1mm)
    activeTool: 'select',
    selectedIds: new Set<EntityId>(),
    snapOptions: { ...DEFAULT_SNAP_OPTIONS },
    snapResult: null,
    gridSize: 10, // 10mm grid
    showGrid: true,
    solveStatus: 'ok',
    overconstrained: new Set<ConstraintId>(),
    cursorPos: { x: 0, y: 0 },
    dimensionDialog: { open: false, constraintId: null, value: '' },
    _history: [],
    _historyIndex: -1,

    // ── Viewport ──────────────────────────────────────────────────────────────
    setViewport: (v) => set(s => { s.viewport = v; }),

    panBy: (dx, dy) => set(s => {
      s.viewport.panX += dx;
      s.viewport.panY += dy;
    }),

    zoomAt: (factor, screenX, screenY, canvasW, canvasH) => set(s => {
      const { panX, panY, zoom } = s.viewport;
      const newZoom = Math.max(5, Math.min(2000, zoom * factor));
      // Keep the world point under cursor stationary
      const wx = (screenX - canvasW / 2 - panX) / zoom;
      const wy = (screenY - canvasH / 2 - panY) / zoom;
      s.viewport.zoom = newZoom;
      s.viewport.panX = screenX - canvasW / 2 - wx * newZoom;
      s.viewport.panY = screenY - canvasH / 2 - wy * newZoom;
    }),

    resetView: () => set(s => { s.viewport = { panX: 0, panY: 0, zoom: 50 }; }),

    // ── Tool ──────────────────────────────────────────────────────────────────
    setActiveTool: (tool) => set(s => {
      s.activeTool = tool;
      s.selectedIds = new Set();
    }),

    // ── Selection ─────────────────────────────────────────────────────────────
    selectIds: (ids) => set(s => { s.selectedIds = new Set(ids); }),
    toggleSelect: (id) => set(s => {
      if (s.selectedIds.has(id)) s.selectedIds.delete(id);
      else s.selectedIds.add(id);
    }),
    clearSelection: () => set(s => { s.selectedIds = new Set(); }),

    // ── Snap ──────────────────────────────────────────────────────────────────
    setSnapResult: (r) => set(s => { s.snapResult = r; }),
    setSnapOptions: (o) => set(s => { Object.assign(s.snapOptions, o); }),
    setCursorPos: (p) => set(s => { s.cursorPos = p; }),

    // ── Entity mutations ──────────────────────────────────────────────────────
    addPoint: (x, y, construction = false) => {
      const id = newId('pt');
      set(s => {
        s.entities[id] = { id, type: 'point', x, y, construction };
      });
      return id;
    },

    addLine: (p1Id, p2Id, construction = false) => {
      const id = newId('ln');
      set(s => {
        s.entities[id] = { id, type: 'line', p1Id, p2Id, construction };
      });
      return id;
    },

    addCircle: (centerId, radius, construction = false) => {
      const id = newId('ci');
      set(s => {
        s.entities[id] = { id, type: 'circle', centerId, radius, construction };
      });
      return id;
    },

    addArc: (centerId, radius, startAngle, endAngle, construction = false) => {
      const id = newId('ar');
      set(s => {
        s.entities[id] = { id, type: 'arc', centerId, radius, startAngle, endAngle, construction };
      });
      return id;
    },

    addRect: (x1, y1, x2, y2, construction = false) => {
      const { addPoint, addLine } = get();
      const p1 = addPoint(x1, y1, construction);
      const p2 = addPoint(x2, y1, construction);
      const p3 = addPoint(x2, y2, construction);
      const p4 = addPoint(x1, y2, construction);
      const l1 = addLine(p1, p2, construction);
      const l2 = addLine(p2, p3, construction);
      const l3 = addLine(p3, p4, construction);
      const l4 = addLine(p4, p1, construction);
      return [p1, p2, p3, p4, l1, l2, l3, l4];
    },

    movePoint: (id, x, y) => set(s => {
      const e = s.entities[id];
      if (e && e.type === 'point') { e.x = x; e.y = y; }
    }),

    moveEntities: (ids, dx, dy) => set(s => {
      // Collect all points referenced by selected entities
      const pointIds = new Set<EntityId>();
      for (const id of ids) {
        const e = s.entities[id];
        if (!e) continue;
        if (e.type === 'point') pointIds.add(e.id);
        if (e.type === 'line') { pointIds.add(e.p1Id); pointIds.add(e.p2Id); }
        if (e.type === 'circle' || e.type === 'arc') pointIds.add((e as CircleEntity | ArcEntity).centerId);
      }
      for (const pid of pointIds) {
        const p = s.entities[pid];
        if (p && p.type === 'point') { p.x += dx; p.y += dy; }
      }
    }),

    deleteEntities: (ids) => set(s => {
      const toDelete = new Set(ids);
      // Also collect dependent points
      for (const id of ids) {
        const e = s.entities[id];
        if (!e) continue;
        if (e.type === 'line') { toDelete.add(e.p1Id); toDelete.add(e.p2Id); }
        if (e.type === 'circle' || e.type === 'arc') {
          // Only delete center if nothing else uses it
          const centerId = (e as CircleEntity | ArcEntity).centerId;
          const usedByOther = Object.values(s.entities).some(
            other => other.id !== id && (
              (other.type === 'circle' || other.type === 'arc') &&
              (other as CircleEntity | ArcEntity).centerId === centerId
            )
          );
          if (!usedByOther) toDelete.add(centerId);
        }
      }
      for (const id of toDelete) delete s.entities[id];
      // Remove constraints referencing deleted entities
      for (const [cid, c] of Object.entries(s.constraints)) {
        if (c.entityIds.some(eid => toDelete.has(eid))) {
          delete s.constraints[cid];
        }
      }
      s.selectedIds = new Set();
    }),

    toggleConstruction: (id) => set(s => {
      const e = s.entities[id];
      if (e) e.construction = !e.construction;
    }),

    updateRadius: (id, radius) => set(s => {
      const e = s.entities[id];
      if (e && (e.type === 'circle' || e.type === 'arc')) e.radius = radius;
    }),

    updateArcAngles: (id, startAngle, endAngle) => set(s => {
      const e = s.entities[id];
      if (e && e.type === 'arc') { e.startAngle = startAngle; e.endAngle = endAngle; }
    }),

    // ── Constraints ───────────────────────────────────────────────────────────
    addConstraint: (c) => {
      const id = newId('co');
      set(s => { s.constraints[id] = { ...c, id }; });
      return id;
    },

    removeConstraint: (id) => set(s => { delete s.constraints[id]; }),

    setSolveStatus: (status, overconstrained) => set(s => {
      s.solveStatus = status;
      s.overconstrained = overconstrained;
    }),

    updateEntityFromSolver: (id, x, y) => set(s => {
      const e = s.entities[id];
      if (e && e.type === 'point') { e.x = x; e.y = y; }
    }),

    updateCircleRadiusFromSolver: (id, radius) => set(s => {
      const e = s.entities[id];
      if (e && (e.type === 'circle' || e.type === 'arc')) e.radius = radius;
    }),

    updateDimensionConstraintValue: (id, value) => set(s => {
      const c = s.constraints[id];
      if (c) c.value = value;
    }),

    // ── Dimension dialog ──────────────────────────────────────────────────────
    openDimensionDialog: (constraintId, initialValue) => set(s => {
      s.dimensionDialog = {
        open: true,
        constraintId,
        value: initialValue !== undefined ? String(initialValue) : '',
      };
    }),

    closeDimensionDialog: () => set(s => {
      s.dimensionDialog = { open: false, constraintId: null, value: '' };
    }),

    // ── History ───────────────────────────────────────────────────────────────
    pushHistory: () => {
      const { entities, constraints, _history, _historyIndex } = get();
      const entry = cloneSketch(entities, constraints);
      set(s => {
        // Truncate future if we branched
        const newHistory = _history.slice(0, _historyIndex + 1);
        newHistory.push(entry);
        if (newHistory.length > MAX_HISTORY) newHistory.shift();
        s._history = newHistory;
        s._historyIndex = newHistory.length - 1;
      });
    },

    undo: () => {
      const { _history, _historyIndex } = get();
      if (_historyIndex <= 0) return;
      const entry = _history[_historyIndex - 1];
      set(s => {
        s.entities = entry.entities as any;
        s.constraints = entry.constraints as any;
        s._historyIndex = _historyIndex - 1;
        s.selectedIds = new Set();
      });
    },

    redo: () => {
      const { _history, _historyIndex } = get();
      if (_historyIndex >= _history.length - 1) return;
      const entry = _history[_historyIndex + 1];
      set(s => {
        s.entities = entry.entities as any;
        s.constraints = entry.constraints as any;
        s._historyIndex = _historyIndex + 1;
        s.selectedIds = new Set();
      });
    },

    // ── Save/Load ─────────────────────────────────────────────────────────────
    exportSketch: () => {
      const { entities, constraints } = get();
      return JSON.stringify({ entities, constraints }, null, 2);
    },

    importSketch: (json) => {
      try {
        const data = JSON.parse(json) as SketchState;
        set(s => {
          s.entities = data.entities;
          s.constraints = data.constraints;
          s.selectedIds = new Set();
        });
      } catch (e) {
        console.error('Failed to import sketch', e);
      }
    },

    clearSketch: () => set(s => {
      s.entities = {};
      s.constraints = {};
      s.selectedIds = new Set();
    }),
  }))
);
