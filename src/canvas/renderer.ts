import {
  Entity, EntityId, SketchConstraint, ConstraintId,
  Vec2, Viewport, SnapResult, ConstraintType,
  PointEntity, LineEntity, CircleEntity, ArcEntity
} from '../geometry/types';
import { dist, midpoint, circlePoint, normalizeAngle, angleInArc } from '../geometry/mathUtils';

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  bg: '#1e1e1e',
  grid: '#2a2a2a',
  gridMajor: '#333',
  gridAxis: '#3a3a3a',
  normal: '#d4d4d4',
  construction: '#4488cc',
  selected: '#00ccff',
  free: '#4ec94e',
  overConstrained: '#ff4444',
  point: '#aaa',
  pointFree: '#4ec94e',
  pointSelected: '#00ccff',
  preview: 'rgba(180,180,255,0.5)',
  dim: '#f5c842',
  dimText: '#f5c842',
  constraintIcon: '#888',
  snap: '#00ffcc',
  selectionBox: 'rgba(0,150,255,0.15)',
  selectionBoxBorder: 'rgba(0,150,255,0.6)',
};

// ─── Coordinate transforms ────────────────────────────────────────────────────
export function worldToScreen(p: Vec2, vp: Viewport, w: number, h: number): Vec2 {
  return {
    x: p.x * vp.zoom + vp.panX + w / 2,
    y: -p.y * vp.zoom + vp.panY + h / 2, // Y-up world, Y-down screen
  };
}

export function screenToWorld(p: Vec2, vp: Viewport, w: number, h: number): Vec2 {
  return {
    x: (p.x - vp.panX - w / 2) / vp.zoom,
    y: -((p.y - vp.panY - h / 2) / vp.zoom),
  };
}

// ─── Point helpers ────────────────────────────────────────────────────────────
function getPoint(entities: Record<EntityId, Entity>, id: EntityId): Vec2 | null {
  const e = entities[id];
  if (!e || e.type !== 'point') return null;
  return { x: (e as PointEntity).x, y: (e as PointEntity).y };
}

function sw(p: Vec2, vp: Viewport, w: number, h: number): Vec2 {
  return worldToScreen(p, vp, w, h);
}

// ─── Main render function ─────────────────────────────────────────────────────
export interface RenderState {
  entities: Record<EntityId, Entity>;
  constraints: Record<ConstraintId, SketchConstraint>;
  viewport: Viewport;
  selectedIds: Set<EntityId>;
  overconstrained: Set<ConstraintId>;
  snapResult: SnapResult | null;
  gridSize: number;
  showGrid: boolean;
  // Tool preview
  previewPoints?: Vec2[];
  previewEntities?: Entity[];
  selectionBox?: { x1: number; y1: number; x2: number; y2: number } | null;
  // QoL overlays
  liveLabel?: { worldPos: Vec2; text: string } | null;
  orthoLock?: { anchor: Vec2; lockedPoint: Vec2 } | null;
}

export function render(ctx: CanvasRenderingContext2D, state: RenderState) {
  const { viewport: vp, entities, constraints, selectedIds, overconstrained } = state;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  if (state.showGrid) drawGrid(ctx, vp, w, h, state.gridSize);
  drawEntities(ctx, entities, constraints, selectedIds, overconstrained, vp, w, h);
  drawConstraintIcons(ctx, entities, constraints, overconstrained, vp, w, h);
  drawDimensions(ctx, entities, constraints, vp, w, h);
  if (state.previewEntities) drawPreviewEntities(ctx, state.previewEntities, entities, vp, w, h);
  if (state.previewPoints) drawPreviewPoints(ctx, state.previewPoints, vp, w, h);
  if (state.selectionBox) drawSelectionBox(ctx, state.selectionBox, vp, w, h);
  if (state.orthoLock) drawOrthoLine(ctx, state.orthoLock, vp, w, h);
  if (state.snapResult) drawSnapIndicator(ctx, state.snapResult, vp, w, h);
  if (state.liveLabel) drawLiveLabel(ctx, state.liveLabel, vp, w, h);
}

// ─── Grid ─────────────────────────────────────────────────────────────────────
function drawGrid(ctx: CanvasRenderingContext2D, vp: Viewport, w: number, h: number, gridSize: number) {
  const minorSize = gridSize;
  const majorSize = gridSize * 10;

  // Determine visible world bounds
  const topLeft = screenToWorld({ x: 0, y: 0 }, vp, w, h);
  const botRight = screenToWorld({ x: w, y: h }, vp, w, h);
  const worldMinX = Math.min(topLeft.x, botRight.x);
  const worldMaxX = Math.max(topLeft.x, botRight.x);
  const worldMinY = Math.min(topLeft.y, botRight.y);
  const worldMaxY = Math.max(topLeft.y, botRight.y);

  // Only draw grid if zoom is sufficient
  const minorPx = minorSize * vp.zoom;
  const majorPx = majorSize * vp.zoom;

  const startX = Math.floor(worldMinX / minorSize) * minorSize;
  const startY = Math.floor(worldMinY / minorSize) * minorSize;

  ctx.save();
  ctx.lineWidth = 0.5;

  if (minorPx > 4) {
    for (let x = startX; x <= worldMaxX; x += minorSize) {
      const sx = worldToScreen({ x, y: 0 }, vp, w, h).x;
      const isMajor = Math.abs(x % majorSize) < 1e-6;
      ctx.strokeStyle = isMajor ? C.gridMajor : C.grid;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (let y = startY; y <= worldMaxY; y += minorSize) {
      const sy = worldToScreen({ x: 0, y }, vp, w, h).y;
      const isMajor = Math.abs(y % majorSize) < 1e-6;
      ctx.strokeStyle = isMajor ? C.gridMajor : C.grid;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }
  } else if (majorPx > 4) {
    for (let x = Math.floor(worldMinX / majorSize) * majorSize; x <= worldMaxX; x += majorSize) {
      const sx = worldToScreen({ x, y: 0 }, vp, w, h).x;
      ctx.strokeStyle = C.gridMajor;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
    }
    for (let y = Math.floor(worldMinY / majorSize) * majorSize; y <= worldMaxY; y += majorSize) {
      const sy = worldToScreen({ x: 0, y }, vp, w, h).y;
      ctx.strokeStyle = C.gridMajor;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke();
    }
  }

  // Draw axes
  const origin = worldToScreen({ x: 0, y: 0 }, vp, w, h);
  ctx.strokeStyle = C.gridAxis;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, origin.y); ctx.lineTo(w, origin.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, h); ctx.stroke();

  ctx.restore();
}

// ─── Entities ─────────────────────────────────────────────────────────────────
function drawEntities(
  ctx: CanvasRenderingContext2D,
  entities: Record<EntityId, Entity>,
  constraints: Record<ConstraintId, SketchConstraint>,
  selectedIds: Set<EntityId>,
  overconstrained: Set<ConstraintId>,
  vp: Viewport, w: number, h: number
) {
  // Determine constrained point IDs (for coloring)
  const constrainedPoints = new Set<EntityId>();
  for (const c of Object.values(constraints)) {
    for (const eid of c.entityIds) constrainedPoints.add(eid);
  }

  // Draw lines and curves first, then points on top
  const sortedEntities = Object.values(entities).sort((a, b) => {
    if (a.type === 'point' && b.type !== 'point') return 1;
    if (a.type !== 'point' && b.type === 'point') return -1;
    return 0;
  });

  for (const e of sortedEntities) {
    const isSelected = selectedIds.has(e.id);
    const isConstruction = e.construction;
    let color = isSelected ? C.selected : (isConstruction ? C.construction : C.normal);
    let lineWidth = isSelected ? 2.5 : (isConstruction ? 1 : 1.5);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;

    if (isConstruction) {
      ctx.setLineDash([6, 4]);
    }

    switch (e.type) {
      case 'point': {
        const s = sw({ x: e.x, y: e.y }, vp, w, h);
        const isConstrained = constrainedPoints.has(e.id);
        const dotColor = isSelected ? C.pointSelected : (isConstrained ? color : C.pointFree);
        const r = isSelected ? 5 : 4;
        ctx.fillStyle = dotColor;
        ctx.strokeStyle = dotColor;
        ctx.lineWidth = 1;
        // Draw cross-hair for free points, filled circle for constrained
        if (!isConstrained) {
          ctx.beginPath();
          ctx.moveTo(s.x - r, s.y); ctx.lineTo(s.x + r, s.y);
          ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x, s.y + r);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(s.x, s.y, r / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'line': {
        const p1 = getPoint(entities, e.p1Id);
        const p2 = getPoint(entities, e.p2Id);
        if (!p1 || !p2) break;
        const s1 = sw(p1, vp, w, h);
        const s2 = sw(p2, vp, w, h);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
        break;
      }
      case 'circle': {
        const center = getPoint(entities, e.centerId);
        if (!center) break;
        const sc = sw(center, vp, w, h);
        const r = e.radius * vp.zoom;
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'arc': {
        const center = getPoint(entities, (e as ArcEntity).centerId);
        if (!center) break;
        const sc = sw(center, vp, w, h);
        const r = e.radius * vp.zoom;
        // Note: screen Y is flipped, so arc angles are negated
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, r, -e.endAngle, -e.startAngle, false);
        ctx.stroke();
        break;
      }
    }

    ctx.restore();
  }
}

// ─── Preview entities (while drawing) ────────────────────────────────────────
function drawPreviewEntities(
  ctx: CanvasRenderingContext2D,
  previewEntities: Entity[],
  entities: Record<EntityId, Entity>,
  vp: Viewport, w: number, h: number
) {
  ctx.save();
  ctx.strokeStyle = C.preview;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;

  for (const e of previewEntities) {
    switch (e.type) {
      case 'line': {
        const p1 = getPoint(entities, e.p1Id);
        const p2 = getPoint(entities, e.p2Id);
        if (!p1 || !p2) break;
        const s1 = sw(p1, vp, w, h);
        const s2 = sw(p2, vp, w, h);
        ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
        break;
      }
      case 'circle': {
        const center = getPoint(entities, e.centerId);
        if (!center) break;
        const sc = sw(center, vp, w, h);
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, e.radius * vp.zoom, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'arc': {
        const center = getPoint(entities, (e as ArcEntity).centerId);
        if (!center) break;
        const sc = sw(center, vp, w, h);
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, e.radius * vp.zoom, -e.endAngle, -e.startAngle, false);
        ctx.stroke();
        break;
      }
    }
  }
  ctx.restore();
}

function drawPreviewPoints(
  ctx: CanvasRenderingContext2D,
  points: Vec2[],
  vp: Viewport, w: number, h: number
) {
  ctx.save();
  ctx.fillStyle = C.preview;
  for (const p of points) {
    const s = sw(p, vp, w, h);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── Selection box ────────────────────────────────────────────────────────────
function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  box: { x1: number; y1: number; x2: number; y2: number },
  vp: Viewport, w: number, h: number
) {
  const s1 = sw({ x: box.x1, y: box.y1 }, vp, w, h);
  const s2 = sw({ x: box.x2, y: box.y2 }, vp, w, h);
  const x = Math.min(s1.x, s2.x);
  const y = Math.min(s1.y, s2.y);
  const bw = Math.abs(s2.x - s1.x);
  const bh = Math.abs(s2.y - s1.y);
  ctx.save();
  ctx.fillStyle = C.selectionBox;
  ctx.strokeStyle = C.selectionBoxBorder;
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, bw, bh);
  ctx.strokeRect(x, y, bw, bh);
  ctx.restore();
}

// ─── Snap indicator ───────────────────────────────────────────────────────────
const SNAP_SYMBOLS: Record<string, (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => void> = {
  endpoint: (ctx, x, y, r) => {
    ctx.strokeRect(x - r, y - r, r * 2, r * 2);
  },
  midpoint: (ctx, x, y, r) => {
    ctx.beginPath();
    ctx.moveTo(x - r, y + r); ctx.lineTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.closePath();
    ctx.stroke();
  },
  center: (ctx, x, y, r) => {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
  },
  quadrant: (ctx, x, y, r) => {
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath(); ctx.stroke();
  },
  intersection: (ctx, x, y, r) => {
    ctx.beginPath();
    ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
    ctx.stroke();
  },
  nearest: (ctx, x, y, r) => {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  },
  grid: (ctx, x, y, r) => {
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.stroke();
  },
};

function drawSnapIndicator(
  ctx: CanvasRenderingContext2D,
  snap: SnapResult,
  vp: Viewport, w: number, h: number
) {
  const s = sw(snap.point, vp, w, h);
  const r = 7;
  ctx.save();
  ctx.strokeStyle = C.snap;
  ctx.fillStyle = C.snap;
  ctx.lineWidth = 1.5;
  const drawFn = SNAP_SYMBOLS[snap.type] ?? SNAP_SYMBOLS.grid;
  drawFn(ctx, s.x, s.y, r);
  ctx.restore();
}

// ─── Constraint icons ─────────────────────────────────────────────────────────
function drawConstraintIcons(
  ctx: CanvasRenderingContext2D,
  entities: Record<EntityId, Entity>,
  constraints: Record<ConstraintId, SketchConstraint>,
  overconstrained: Set<ConstraintId>,
  vp: Viewport, w: number, h: number
) {
  // Group non-dimensional constraints by entity for icon placement
  const nonDim: ConstraintType[] = [
    'coincident','collinear','parallel','perpendicular','tangent',
    'equal','symmetric','horizontal','vertical','fixed','midpoint',
    'pointOnLine','pointOnCircle','concentric'
  ];

  for (const c of Object.values(constraints)) {
    if (!nonDim.includes(c.type)) continue;
    const isOC = overconstrained.has(c.id);
    const iconColor = isOC ? C.overConstrained : C.constraintIcon;
    drawConstraintIcon(ctx, c, entities, vp, w, h, iconColor);
  }
}

function getEntityCenter(e: Entity, entities: Record<EntityId, Entity>): Vec2 | null {
  switch (e.type) {
    case 'point': return { x: (e as PointEntity).x, y: (e as PointEntity).y };
    case 'line': {
      const p1 = getPoint(entities, (e as LineEntity).p1Id);
      const p2 = getPoint(entities, (e as LineEntity).p2Id);
      if (!p1 || !p2) return null;
      return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    }
    case 'circle':
    case 'arc': return getPoint(entities, (e as CircleEntity | ArcEntity).centerId);
    default: return null;
  }
}

function drawConstraintIcon(
  ctx: CanvasRenderingContext2D,
  c: SketchConstraint,
  entities: Record<EntityId, Entity>,
  vp: Viewport, w: number, h: number,
  color: string
) {
  if (c.entityIds.length === 0) return;
  const e = entities[c.entityIds[0]];
  if (!e) return;
  const worldPos = getEntityCenter(e, entities);
  if (!worldPos) return;

  const s = sw({ x: worldPos.x + 3 / vp.zoom, y: worldPos.y + 3 / vp.zoom }, vp, w, h);

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.font = '10px monospace';
  ctx.lineWidth = 1;

  const icons: Partial<Record<ConstraintType, string>> = {
    coincident: '●',
    collinear: '⟶',
    parallel: '∥',
    perpendicular: '⊥',
    tangent: 'T',
    equal: '=',
    symmetric: '⟺',
    horizontal: '—',
    vertical: '|',
    fixed: '🔒',
    midpoint: 'M',
    pointOnLine: '◇',
    pointOnCircle: '◯',
    concentric: '⊙',
  };

  const icon = icons[c.type] ?? '?';
  ctx.fillText(icon, s.x, s.y);
  ctx.restore();
}

// ─── Dimensional constraints ──────────────────────────────────────────────────
const dimTypes: ConstraintType[] = [
  'distance', 'horizontalDistance', 'verticalDistance', 'angle', 'radius', 'diameter'
];

function drawDimensions(
  ctx: CanvasRenderingContext2D,
  entities: Record<EntityId, Entity>,
  constraints: Record<ConstraintId, SketchConstraint>,
  vp: Viewport, w: number, h: number
) {
  for (const c of Object.values(constraints)) {
    if (!dimTypes.includes(c.type)) continue;
    drawDimensionAnnotation(ctx, c, entities, vp, w, h);
  }
}

function drawDimensionAnnotation(
  ctx: CanvasRenderingContext2D,
  c: SketchConstraint,
  entities: Record<EntityId, Entity>,
  vp: Viewport, w: number, h: number
) {
  if (c.value === undefined) return;
  const value = c.type === 'angle' ? `${c.value.toFixed(1)}°` :
                c.type === 'diameter' ? `⌀${c.value.toFixed(2)}` :
                `${c.value.toFixed(2)}`;

  ctx.save();
  ctx.strokeStyle = C.dim;
  ctx.fillStyle = C.dimText;
  ctx.lineWidth = 1;
  ctx.font = 'bold 11px monospace';

  switch (c.type) {
    case 'distance': {
      if (c.entityIds.length < 2) break;
      const e1 = entities[c.entityIds[0]];
      const e2 = entities[c.entityIds[1]];
      const p1 = getEntityCenter(e1, entities);
      const p2 = getEntityCenter(e2, entities);
      if (!p1 || !p2) break;
      drawLinearDim(ctx, p1, p2, value, c.labelPos, vp, w, h, false);
      break;
    }
    case 'horizontalDistance': {
      if (c.entityIds.length < 2) break;
      const e1 = entities[c.entityIds[0]];
      const e2 = entities[c.entityIds[1]];
      const p1 = getEntityCenter(e1, entities);
      const p2 = getEntityCenter(e2, entities);
      if (!p1 || !p2) break;
      drawLinearDim(ctx, p1, p2, value, c.labelPos, vp, w, h, true, 'horizontal');
      break;
    }
    case 'verticalDistance': {
      if (c.entityIds.length < 2) break;
      const e1 = entities[c.entityIds[0]];
      const e2 = entities[c.entityIds[1]];
      const p1 = getEntityCenter(e1, entities);
      const p2 = getEntityCenter(e2, entities);
      if (!p1 || !p2) break;
      drawLinearDim(ctx, p1, p2, value, c.labelPos, vp, w, h, true, 'vertical');
      break;
    }
    case 'radius': {
      if (c.entityIds.length < 1) break;
      const e = entities[c.entityIds[0]];
      if (!e || (e.type !== 'circle' && e.type !== 'arc')) break;
      const center = getPoint(entities, (e as CircleEntity | ArcEntity).centerId);
      if (!center) break;
      drawRadiusDim(ctx, center, e.radius, `R${value}`, vp, w, h);
      break;
    }
    case 'diameter': {
      if (c.entityIds.length < 1) break;
      const e = entities[c.entityIds[0]];
      if (!e || e.type !== 'circle') break;
      const center = getPoint(entities, (e as CircleEntity).centerId);
      if (!center) break;
      drawRadiusDim(ctx, center, e.radius, value, vp, w, h);
      break;
    }
    case 'angle': {
      if (c.entityIds.length < 2) break;
      drawAngleDim(ctx, c, entities, value, vp, w, h);
      break;
    }
  }

  ctx.restore();
}

function drawLinearDim(
  ctx: CanvasRenderingContext2D,
  p1: Vec2, p2: Vec2, label: string,
  labelPos: Vec2 | undefined,
  vp: Viewport, w: number, h: number,
  projected: boolean,
  direction?: 'horizontal' | 'vertical'
) {
  let a = p1, b = p2;
  if (direction === 'horizontal') {
    b = { x: p2.x, y: p1.y };
  } else if (direction === 'vertical') {
    b = { x: p1.x, y: p2.y };
  }

  const offset = labelPos ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 8 / vp.zoom };

  const sa = sw(a, vp, w, h);
  const sb = sw(b, vp, w, h);
  const sl = sw(offset, vp, w, h);

  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(sa.x, sa.y);
  ctx.lineTo(sl.x, sl.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sb.x, sb.y);
  ctx.lineTo(sl.x, sl.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Dimension line
  ctx.beginPath();
  ctx.moveTo(sa.x, sa.y);
  ctx.lineTo(sb.x, sb.y);
  ctx.stroke();

  // Label background
  const metrics = ctx.measureText(label);
  const tw = metrics.width + 6;
  const th = 14;
  ctx.fillStyle = 'rgba(30,30,30,0.85)';
  ctx.fillRect(sl.x - tw / 2, sl.y - th / 2, tw, th);
  ctx.fillStyle = C.dimText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, sl.x, sl.y);
}

function drawRadiusDim(
  ctx: CanvasRenderingContext2D,
  center: Vec2, radius: number, label: string,
  vp: Viewport, w: number, h: number
) {
  const angle = Math.PI / 4;
  const endPt = circlePoint(center, radius, angle);
  const extPt = circlePoint(center, radius * 1.3, angle);

  const sc = sw(center, vp, w, h);
  const se = sw(endPt, vp, w, h);
  const sx = sw(extPt, vp, w, h);

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(sc.x, sc.y);
  ctx.lineTo(se.x, se.y);
  ctx.stroke();

  // Arrow at circle
  drawArrowhead(ctx, sc, se);

  const metrics = ctx.measureText(label);
  const tw = metrics.width + 6;
  const th = 14;
  ctx.fillStyle = 'rgba(30,30,30,0.85)';
  ctx.fillRect(sx.x, sx.y - th / 2, tw, th);
  ctx.fillStyle = C.dimText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, sx.x + 3, sx.y);
}

function drawAngleDim(
  ctx: CanvasRenderingContext2D,
  c: SketchConstraint,
  entities: Record<EntityId, Entity>,
  label: string,
  vp: Viewport, w: number, h: number
) {
  // Simplified: just draw text at midpoint between entity centers
  const e1 = entities[c.entityIds[0]];
  const e2 = entities[c.entityIds[1]];
  const p1 = getEntityCenter(e1, entities);
  const p2 = getEntityCenter(e2, entities);
  if (!p1 || !p2) return;
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const s = sw(mid, vp, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.dimText;
  ctx.fillText(label, s.x, s.y);
}

function drawArrowhead(ctx: CanvasRenderingContext2D, from: Vec2, to: Vec2) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;
  const ux = dx / len, uy = dy / len;
  const size = 8;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(from.x + ux * size - uy * size * 0.4, from.y + uy * size + ux * size * 0.4);
  ctx.lineTo(from.x + ux * size + uy * size * 0.4, from.y + uy * size - ux * size * 0.4);
  ctx.closePath();
  ctx.fill();
}

// ─── Live label (dimension display while drawing) ─────────────────────────────
function drawLiveLabel(
  ctx: CanvasRenderingContext2D,
  label: { worldPos: Vec2; text: string },
  vp: Viewport, w: number, h: number
) {
  const sp = worldToScreen(label.worldPos, vp, w, h);
  const text = label.text;
  ctx.save();
  ctx.font = 'bold 11px monospace';
  const tw = ctx.measureText(text).width;
  const pad = 5, rx = 3;
  const bx = sp.x + 14, by = sp.y - 30, bw = tw + pad * 2, bh = 18;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, rx);
  ctx.fill();
  ctx.fillStyle = C.dim;
  ctx.fillText(text, bx + pad, by + bh - 5);
  ctx.restore();
}

// ─── Ortho lock axis line ─────────────────────────────────────────────────────
function drawOrthoLine(
  ctx: CanvasRenderingContext2D,
  ortho: { anchor: Vec2; lockedPoint: Vec2 },
  vp: Viewport, w: number, h: number
) {
  const a = worldToScreen(ortho.anchor, vp, w, h);
  const b = worldToScreen(ortho.lockedPoint, vp, w, h);
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.1) return;
  const ux = dx / len, uy = dy / len;
  // Extend line to canvas edges
  const tFwd = Math.max(w, h) * 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 200, 0, 0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(a.x - ux * tFwd, a.y - uy * tFwd);
  ctx.lineTo(a.x + ux * tFwd, a.y + uy * tFwd);
  ctx.stroke();
  ctx.restore();
}
