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
export interface DimPreview {
  type: 'distance' | 'horizontalDistance' | 'verticalDistance' | 'angle' | 'radius' | 'diameter';
  entityIds: EntityId[];
  labelPos: Vec2;
  labelText: string;
}

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
  // Dimension tool
  dimPreview?: DimPreview | null;
  highlightIds?: Set<EntityId>;
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
  drawEntities(ctx, entities, constraints, selectedIds, overconstrained, state.highlightIds, vp, w, h);
  drawConstraintIcons(ctx, entities, constraints, overconstrained, vp, w, h);
  drawDimensions(ctx, entities, constraints, overconstrained, vp, w, h);
  if (state.dimPreview) drawDimPreview(ctx, state.dimPreview, entities, vp, w, h);
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
  highlightIds: Set<EntityId> | undefined,
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
    const isHighlighted = highlightIds?.has(e.id) ?? false;
    const isConstruction = e.construction;
    let color = isSelected ? C.selected : isHighlighted ? '#ffcc44' : (isConstruction ? C.construction : C.normal);
    let lineWidth = (isSelected || isHighlighted) ? 2.5 : (isConstruction ? 1 : 1.5);

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
  ctx.strokeStyle = 'rgba(160,200,255,0.9)';
  ctx.setLineDash([]);
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
const DIM_TYPES: ConstraintType[] = [
  'distance', 'horizontalDistance', 'verticalDistance', 'angle', 'radius', 'diameter',
];

// Arrow tip at (tipX, tipY) coming from direction tail→tip
function drawArrowTip(
  ctx: CanvasRenderingContext2D,
  tipX: number, tipY: number,
  tailX: number, tailY: number,
  size: number,
) {
  const dx = tipX - tailX, dy = tipY - tailY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const wx = -uy * size * 0.35, wy = ux * size * 0.35;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - ux * size + wx, tipY - uy * size + wy);
  ctx.lineTo(tipX - ux * size - wx, tipY - uy * size - wy);
  ctx.closePath();
  ctx.fill();
}

function drawDimLabelBox(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  text: string,
  color: string,
) {
  ctx.font = 'bold 11px monospace';
  const tw = ctx.measureText(text).width + 6;
  const th = 14;
  ctx.fillStyle = 'rgba(25,25,25,0.9)';
  ctx.fillRect(cx - tw / 2, cy - th / 2, tw, th);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

function drawLinearDimAnnotation(
  ctx: CanvasRenderingContext2D,
  p1: Vec2, p2: Vec2,
  label: string,
  labelPos: Vec2,
  type: 'distance' | 'horizontalDistance' | 'verticalDistance',
  vp: Viewport, w: number, h: number,
  color: string,
) {
  const GAP = 1.5 / vp.zoom;
  const OVERSHOOT = 2 / vp.zoom;
  const ARROW_PX = 6;

  let dimPt1: Vec2, dimPt2: Vec2;
  if (type === 'horizontalDistance') {
    dimPt1 = { x: p1.x, y: labelPos.y };
    dimPt2 = { x: p2.x, y: labelPos.y };
  } else if (type === 'verticalDistance') {
    dimPt1 = { x: labelPos.x, y: p1.y };
    dimPt2 = { x: labelPos.x, y: p2.y };
  } else {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d;
    const perpOff = (labelPos.x - p1.x) * nx + (labelPos.y - p1.y) * ny;
    dimPt1 = { x: p1.x + nx * perpOff, y: p1.y + ny * perpOff };
    dimPt2 = { x: p2.x + nx * perpOff, y: p2.y + ny * perpOff };
  }

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  // Extension lines
  ctx.globalAlpha = 0.75;
  function extLine(from: Vec2, to: Vec2) {
    const ex = to.x - from.x, ey = to.y - from.y;
    const el = Math.hypot(ex, ey) || 1;
    const ux = ex / el, uy = ey / el;
    const ss = sw({ x: from.x + ux * GAP, y: from.y + uy * GAP }, vp, w, h);
    const se2 = sw({ x: to.x + ux * OVERSHOOT, y: to.y + uy * OVERSHOOT }, vp, w, h);
    ctx.beginPath(); ctx.moveTo(ss.x, ss.y); ctx.lineTo(se2.x, se2.y); ctx.stroke();
  }
  extLine(p1, dimPt1);
  extLine(p2, dimPt2);
  ctx.globalAlpha = 1;

  const sd1 = sw(dimPt1, vp, w, h);
  const sd2 = sw(dimPt2, vp, w, h);
  const dimLenPx = Math.hypot(sd2.x - sd1.x, sd2.y - sd1.y);
  ctx.beginPath(); ctx.moveTo(sd1.x, sd1.y); ctx.lineTo(sd2.x, sd2.y); ctx.stroke();

  if (dimLenPx > ARROW_PX * 3.5) {
    drawArrowTip(ctx, sd1.x, sd1.y, sd2.x, sd2.y, ARROW_PX);
    drawArrowTip(ctx, sd2.x, sd2.y, sd1.x, sd1.y, ARROW_PX);
  } else {
    const ddx = sd2.x - sd1.x, ddy = sd2.y - sd1.y;
    const ll = Math.hypot(ddx, ddy) || 1;
    const oux = ddx / ll * ARROW_PX * 1.5, ouy = ddy / ll * ARROW_PX * 1.5;
    drawArrowTip(ctx, sd1.x - oux, sd1.y - ouy, sd1.x + oux, sd1.y + ouy, ARROW_PX);
    drawArrowTip(ctx, sd2.x + oux, sd2.y + ouy, sd2.x - oux, sd2.y - ouy, ARROW_PX);
  }

  const lx = (sd1.x + sd2.x) / 2, ly = (sd1.y + sd2.y) / 2;
  drawDimLabelBox(ctx, lx, ly, label, color);
  ctx.restore();
}

function drawRadiusDimAnnotation(
  ctx: CanvasRenderingContext2D,
  center: Vec2, radius: number,
  label: string,
  labelPos: Vec2 | undefined,
  vp: Viewport, w: number, h: number,
  color: string,
) {
  let angle = Math.PI / 4;
  if (labelPos) angle = Math.atan2(labelPos.y - center.y, labelPos.x - center.x);
  const onCircle = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  const labelWorld = { x: center.x + Math.cos(angle) * (radius + 10 / vp.zoom), y: center.y + Math.sin(angle) * (radius + 10 / vp.zoom) };

  const sc = sw(center, vp, w, h);
  const so = sw(onCircle, vp, w, h);
  const sl = sw(labelWorld, vp, w, h);

  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(sc.x, sc.y); ctx.lineTo(so.x, so.y); ctx.stroke();
  drawArrowTip(ctx, so.x, so.y, sc.x, sc.y, 6);
  drawDimLabelBox(ctx, sl.x, sl.y, label, color);
  ctx.restore();
}

function drawAngleDimAnnotation(
  ctx: CanvasRenderingContext2D,
  l1: LineEntity, l2: LineEntity,
  label: string,
  labelPos: Vec2 | undefined,
  entities: Record<EntityId, Entity>,
  vp: Viewport, w: number, h: number,
  color: string,
) {
  const a = entities[l1.p1Id] as PointEntity | undefined;
  const b = entities[l1.p2Id] as PointEntity | undefined;
  const c = entities[l2.p1Id] as PointEntity | undefined;
  const d = entities[l2.p2Id] as PointEntity | undefined;
  if (!a || !b || !c || !d) return;

  const denom = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(denom) < 1e-9) return;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denom;
  const intersect: Vec2 = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };

  const ang1 = Math.atan2(b.y - a.y, b.x - a.x);
  const ang2 = Math.atan2(d.y - c.y, d.x - c.x);

  const arcR = labelPos
    ? Math.hypot(labelPos.x - intersect.x, labelPos.y - intersect.y)
    : 15 / vp.zoom;

  // Choose arc sector closest to labelPos
  let startAng = ang1, endAng = ang2;
  while (endAng < startAng) endAng += Math.PI * 2;
  if (labelPos) {
    const midAng = Math.atan2(labelPos.y - intersect.y, labelPos.x - intersect.x);
    const midNorm = ((midAng - startAng) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    if (midNorm > endAng - startAng) {
      startAng = ang2; endAng = ang1;
      while (endAng < startAng) endAng += Math.PI * 2;
    }
  }

  const si = sw(intersect, vp, w, h);
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(si.x, si.y, arcR * vp.zoom, -endAng, -startAng, false);
  ctx.stroke();

  const midAngFinal = (startAng + endAng) / 2;
  const labelW = { x: intersect.x + Math.cos(midAngFinal) * arcR, y: intersect.y + Math.sin(midAngFinal) * arcR };
  const ls = sw(labelW, vp, w, h);
  drawDimLabelBox(ctx, ls.x, ls.y, label, color);
  ctx.restore();
}

function formatDimLabel(c: SketchConstraint): string {
  if (c.value === undefined) return '';
  if (c.type === 'angle') return `${c.value.toFixed(1)}°`;
  if (c.type === 'diameter') return `⌀${c.value.toFixed(2)}`;
  if (c.type === 'radius') return `R${c.value.toFixed(2)}`;
  return c.value.toFixed(2);
}

function dispatchDimAnnotation(
  ctx: CanvasRenderingContext2D,
  type: 'distance' | 'horizontalDistance' | 'verticalDistance' | 'angle' | 'radius' | 'diameter',
  entityIds: EntityId[],
  label: string,
  labelPos: Vec2 | undefined,
  entities: Record<EntityId, Entity>,
  vp: Viewport, w: number, h: number,
  color: string,
) {
  switch (type) {
    case 'distance':
    case 'horizontalDistance':
    case 'verticalDistance': {
      if (entityIds.length < 2) break;
      const p1 = getEntityCenter(entities[entityIds[0]], entities);
      const p2 = getEntityCenter(entities[entityIds[1]], entities);
      if (!p1 || !p2) break;
      const defLabelPos = labelPos ?? { x: (p1.x + p2.x) / 2, y: Math.max(p1.y, p2.y) + 12 / vp.zoom };
      drawLinearDimAnnotation(ctx, p1, p2, label, defLabelPos, type, vp, w, h, color);
      break;
    }
    case 'radius':
    case 'diameter': {
      if (entityIds.length < 1) break;
      const e = entities[entityIds[0]];
      if (!e || (e.type !== 'circle' && e.type !== 'arc')) break;
      const center = getPoint(entities, (e as CircleEntity | ArcEntity).centerId);
      if (!center) break;
      drawRadiusDimAnnotation(ctx, center, e.radius, label, labelPos, vp, w, h, color);
      break;
    }
    case 'angle': {
      if (entityIds.length < 2) break;
      const l1 = entities[entityIds[0]] as LineEntity | undefined;
      const l2 = entities[entityIds[1]] as LineEntity | undefined;
      if (!l1 || l1.type !== 'line' || !l2 || l2.type !== 'line') break;
      drawAngleDimAnnotation(ctx, l1, l2, label, labelPos, entities, vp, w, h, color);
      break;
    }
  }
}

function drawDimensions(
  ctx: CanvasRenderingContext2D,
  entities: Record<EntityId, Entity>,
  constraints: Record<ConstraintId, SketchConstraint>,
  overconstrained: Set<ConstraintId>,
  vp: Viewport, w: number, h: number,
) {
  ctx.font = 'bold 11px monospace';
  for (const c of Object.values(constraints)) {
    if (!DIM_TYPES.includes(c.type) || c.value === undefined) continue;
    const isOC = overconstrained.has(c.id);
    dispatchDimAnnotation(
      ctx, c.type as any, c.entityIds,
      formatDimLabel(c), c.labelPos, entities, vp, w, h,
      isOC ? C.overConstrained : C.dim,
    );
  }
}

function drawDimPreview(
  ctx: CanvasRenderingContext2D,
  preview: { type: string; entityIds: EntityId[]; labelPos: Vec2; labelText: string },
  entities: Record<EntityId, Entity>,
  vp: Viewport, w: number, h: number,
) {
  if (!preview.labelText) return;
  ctx.font = 'bold 11px monospace';
  dispatchDimAnnotation(
    ctx, preview.type as any, preview.entityIds,
    preview.labelText, preview.labelPos, entities, vp, w, h,
    'rgba(160,220,255,0.9)',
  );
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
