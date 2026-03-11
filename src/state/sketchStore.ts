import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  Entity, EntityId, SketchConstraint, ConstraintId, ConstraintType,
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

  // UI scale
  uiScale: number;
  setUiScale(s: number): void;

  // Pending constraint pick mode
  pendingConstraint: { type: ConstraintType; minEntities: number; collectedIds: EntityId[] } | null;
  setPendingConstraint(c: { type: ConstraintType; minEntities: number } | null): void;

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
  arcMode: 0 | 1 | 2;
  setArcMode(m: 0 | 1 | 2): void;

  // Selection
  selectIds(ids: EntityId[]): void;
  toggleSelect(id: EntityId): void;
  clearSelection(): void;

  // Snap
  setSnapResult(r: SnapResult | null): void;
  setSnapOptions(o: Partial<SnapOptions>): void;
  setGridSize(n: number): void;
  setCursorPos(p: Vec2): void;

  // Viewport extras
  orthoActive: boolean;
  setOrthoActive(v: boolean): void;
  fitView(entityIds: EntityId[], canvasW: number, canvasH: number): void;

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
  splitLineAtParams(lineId: EntityId, t0: number, t1: number): void;
  convertCircleToArc(circleId: EntityId, startAngle: number, endAngle: number): EntityId;

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

// ─── Arc endpoint sync ───────────────────────────────────────────────────────
function syncArcEndpoints(s: { entities: Record<EntityId, Entity> }, arcId: EntityId): void {
  const arc = s.entities[arcId] as ArcEntity | undefined;
  if (!arc || arc.type !== 'arc' || !arc.startPtId || !arc.endPtId) return;
  const center = s.entities[arc.centerId] as PointEntity | undefined;
  if (!center) return;
  const sp = s.entities[arc.startPtId] as PointEntity | undefined;
  const ep = s.entities[arc.endPtId] as PointEntity | undefined;
  if (sp) { sp.x = center.x + arc.radius * Math.cos(arc.startAngle); sp.y = center.y + arc.radius * Math.sin(arc.startAngle); }
  if (ep) { ep.x = center.x + arc.radius * Math.cos(arc.endAngle); ep.y = center.y + arc.radius * Math.sin(arc.endAngle); }
}

// Sync all arcs that reference a given point as their center
function syncArcsForCenter(s: { entities: Record<EntityId, Entity> }, pointId: EntityId): void {
  for (const e of Object.values(s.entities)) {
    if (e.type === 'arc' && (e as ArcEntity).centerId === pointId) {
      syncArcEndpoints(s, e.id);
    }
  }
}

// When an arc endpoint (startPtId/endPtId) is dragged, update the arc's angle to match
function syncArcFromEndpoint(s: { entities: Record<EntityId, Entity> }, ptId: EntityId): void {
  const pt = s.entities[ptId] as PointEntity | undefined;
  if (!pt || pt.type !== 'point') return;
  for (const e of Object.values(s.entities)) {
    if (e.type !== 'arc') continue;
    const arc = e as ArcEntity;
    const center = s.entities[arc.centerId] as PointEntity | undefined;
    if (!center) continue;
    if (arc.startPtId === ptId) {
      arc.startAngle = Math.atan2(pt.y - center.y, pt.x - center.x);
    } else if (arc.endPtId === ptId) {
      arc.endAngle = Math.atan2(pt.y - center.y, pt.x - center.x);
    }
  }
}

// ─── Store implementation ────────────────────────────────────────────────────
export const useSketchStore = create<SketchStore>()(
  immer((set, get) => ({
    entities: {},
    constraints: {},
    viewport: { panX: 0, panY: 0, zoom: 50 }, // 50px per unit (1 unit = 1mm)
    activeTool: 'select',
    arcMode: 0,
    selectedIds: new Set<EntityId>(),
    snapOptions: { ...DEFAULT_SNAP_OPTIONS },
    snapResult: null,
    gridSize: 10, // 10mm grid
    showGrid: true,
    solveStatus: 'ok',
    overconstrained: new Set<ConstraintId>(),
    cursorPos: { x: 0, y: 0 },
    dimensionDialog: { open: false, constraintId: null, value: '' },
    uiScale: 1.0,
    pendingConstraint: null,
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
    setArcMode: (m) => set(s => { s.arcMode = m; }),

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
    setGridSize: (n) => set(s => { s.gridSize = n; }),
    setCursorPos: (p) => set(s => { s.cursorPos = p; }),

    // ── Viewport extras ───────────────────────────────────────────────────────
    orthoActive: false,
    setOrthoActive: (v) => set(s => { s.orthoActive = v; }),
    fitView: (entityIds, canvasW, canvasH) => set(s => {
      if (entityIds.length === 0) return;
      const pts: Vec2[] = [];
      for (const id of entityIds) {
        const e = s.entities[id];
        if (!e) continue;
        if (e.type === 'point') pts.push({ x: (e as PointEntity).x, y: (e as PointEntity).y });
        else if (e.type === 'line') {
          const p1 = s.entities[(e as LineEntity).p1Id] as PointEntity | undefined;
          const p2 = s.entities[(e as LineEntity).p2Id] as PointEntity | undefined;
          if (p1) pts.push({ x: p1.x, y: p1.y });
          if (p2) pts.push({ x: p2.x, y: p2.y });
        } else if (e.type === 'circle' || e.type === 'arc') {
          const c = s.entities[(e as CircleEntity).centerId] as PointEntity | undefined;
          const r = (e as CircleEntity).radius;
          if (c) {
            pts.push({ x: c.x - r, y: c.y - r });
            pts.push({ x: c.x + r, y: c.y + r });
          }
        }
      }
      if (pts.length === 0) return;
      const minX = Math.min(...pts.map(p => p.x));
      const maxX = Math.max(...pts.map(p => p.x));
      const minY = Math.min(...pts.map(p => p.y));
      const maxY = Math.max(...pts.map(p => p.y));
      const bW = maxX - minX || 20;
      const bH = maxY - minY || 20;
      const zoom = Math.min(canvasW / (bW * 1.4), canvasH / (bH * 1.4), 2000);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      s.viewport.zoom = Math.max(5, zoom);
      s.viewport.panX = -cx * zoom;
      s.viewport.panY = cy * zoom;
    }),

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
      const arcId = newId('ar');
      const startPtId = newId('pt');
      const endPtId = newId('pt');
      set(s => {
        const center = s.entities[centerId] as PointEntity | undefined;
        const cx = center?.x ?? 0, cy = center?.y ?? 0;
        s.entities[startPtId] = {
          id: startPtId, type: 'point', construction,
          x: cx + radius * Math.cos(startAngle),
          y: cy + radius * Math.sin(startAngle),
        };
        s.entities[endPtId] = {
          id: endPtId, type: 'point', construction,
          x: cx + radius * Math.cos(endAngle),
          y: cy + radius * Math.sin(endAngle),
        };
        s.entities[arcId] = { id: arcId, type: 'arc', centerId, radius, startAngle, endAngle, construction, startPtId, endPtId };
      });
      return arcId;
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

    splitLineAtParams: (lineId, t0, t1) => {
      const { entities } = get();
      const line = entities[lineId] as LineEntity | undefined;
      if (!line || line.type !== 'line') return;
      const p1e = entities[line.p1Id] as PointEntity | undefined;
      const p2e = entities[line.p2Id] as PointEntity | undefined;
      if (!p1e || !p2e) return;

      const { addPoint, addLine } = get();
      const EPSILON = 0.001;

      // Points that will anchor the two surviving segments
      const startId = line.p1Id;
      const endId = line.p2Id;

      // Intermediate point at t0 (if not at the very start)
      let midStartId: EntityId | null = null;
      if (t0 > EPSILON) {
        midStartId = addPoint(
          p1e.x + t0 * (p2e.x - p1e.x),
          p1e.y + t0 * (p2e.y - p1e.y),
          line.construction
        );
      }

      // Intermediate point at t1 (if not at the very end)
      let midEndId: EntityId | null = null;
      if (t1 < 1 - EPSILON) {
        midEndId = addPoint(
          p1e.x + t1 * (p2e.x - p1e.x),
          p1e.y + t1 * (p2e.y - p1e.y),
          line.construction
        );
      }

      // Remove original line entity (but NOT its endpoints)
      set(s => {
        delete s.entities[lineId];
        // Remove constraints referencing this line
        for (const [cid, c] of Object.entries(s.constraints)) {
          if (c.entityIds.includes(lineId)) delete s.constraints[cid];
        }
      });

      // Add surviving segments
      if (midStartId && t0 > EPSILON) {
        addLine(startId, midStartId, line.construction);
      }
      if (midEndId && t1 < 1 - EPSILON) {
        addLine(midEndId, endId, line.construction);
      }

      // Remove original endpoints that are now orphaned (no line references them)
      set(s => {
        const toDelete: EntityId[] = [];
        for (const ptId of [startId, endId]) {
          const stillUsed = Object.values(s.entities).some(
            e => e.type === 'line' && ((e as LineEntity).p1Id === ptId || (e as LineEntity).p2Id === ptId)
          );
          if (!stillUsed && s.entities[ptId]) toDelete.push(ptId);
        }
        for (const id of toDelete) {
          delete s.entities[id];
          // Remove constraints referencing the orphaned point
          for (const [cid, c] of Object.entries(s.constraints)) {
            if (c.entityIds.includes(id)) delete s.constraints[cid];
          }
        }
      });
    },

    convertCircleToArc: (circleId, startAngle, endAngle) => {
      const { entities } = get();
      const circ = entities[circleId] as CircleEntity | undefined;
      if (!circ || circ.type !== 'circle') return '';
      const { centerId, radius, construction } = circ;

      // Remove only the circle entity (keep center point)
      set(s => {
        delete s.entities[circleId];
        for (const [cid, c] of Object.entries(s.constraints)) {
          if (c.entityIds.includes(circleId)) delete s.constraints[cid];
        }
      });

      return get().addArc(centerId, radius, startAngle, endAngle, construction);
    },

    movePoint: (id, x, y) => set(s => {
      const e = s.entities[id];
      if (e && e.type === 'point') { e.x = x; e.y = y; }
      syncArcFromEndpoint(s, id); // if dragging an arc endpoint, update arc angles
      syncArcsForCenter(s, id);   // if dragging an arc center, sync its endpoints
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
      // For each moved point, update arc angles if it's an arc endpoint
      for (const pid of pointIds) {
        syncArcFromEndpoint(s, pid);
      }
      // Sync arc endpoints (position from angle) for arc centers that moved
      for (const id of ids) {
        if (s.entities[id]?.type === 'arc') syncArcEndpoints(s, id);
        if (s.entities[id]?.type === 'point') syncArcsForCenter(s, id);
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
        if (e.type === 'arc') {
          const arc = e as ArcEntity;
          if (arc.startPtId) toDelete.add(arc.startPtId);
          if (arc.endPtId) toDelete.add(arc.endPtId);
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
      if (e && (e.type === 'circle' || e.type === 'arc')) { e.radius = radius; }
      if (s.entities[id]?.type === 'arc') syncArcEndpoints(s, id);
    }),

    updateArcAngles: (id, startAngle, endAngle) => set(s => {
      const e = s.entities[id];
      if (e && e.type === 'arc') { e.startAngle = startAngle; e.endAngle = endAngle; syncArcEndpoints(s, id); }
    }),

    // ── Constraints ───────────────────────────────────────────────────────────
    addConstraint: (c) => {
      const id = newId('co');
      set(s => {
        // H/V constraints are mutually exclusive on the same entity
        if (c.type === 'horizontal' || c.type === 'vertical') {
          const opposite = c.type === 'horizontal' ? 'vertical' : 'horizontal';
          for (const [cid, existing] of Object.entries(s.constraints)) {
            if (existing.type === opposite && existing.entityIds.some(eid => c.entityIds.includes(eid))) {
              delete s.constraints[cid];
            }
          }
        }
        s.constraints[id] = { ...c, id };
      });
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
      syncArcsForCenter(s, id);
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

    setUiScale: (scale) => set(s => { s.uiScale = scale; }),

    setPendingConstraint: (c) => set(s => {
      s.pendingConstraint = c ? { ...c, collectedIds: [] } : null;
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
