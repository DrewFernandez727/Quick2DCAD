// ─── Entity IDs ──────────────────────────────────────────────────────────────
export type EntityId = string;
export type ConstraintId = string;

// ─── World coordinate ────────────────────────────────────────────────────────
export interface Vec2 { x: number; y: number }

// ─── Geometric entities ──────────────────────────────────────────────────────
export interface PointEntity {
  id: EntityId;
  type: 'point';
  x: number;
  y: number;
  construction: boolean;
}

export interface LineEntity {
  id: EntityId;
  type: 'line';
  p1Id: EntityId;
  p2Id: EntityId;
  construction: boolean;
}

export interface CircleEntity {
  id: EntityId;
  type: 'circle';
  centerId: EntityId;
  radius: number;
  construction: boolean;
}

export interface ArcEntity {
  id: EntityId;
  type: 'arc';
  centerId: EntityId;
  radius: number;
  startAngle: number; // radians
  endAngle: number;   // radians
  construction: boolean;
  startPtId?: EntityId; // point entity at arc start
  endPtId?: EntityId;   // point entity at arc end
}

export interface RectEntity {
  id: EntityId;
  type: 'rect';
  // Stored as four line IDs + four point IDs (created on add)
  lineIds: [EntityId, EntityId, EntityId, EntityId];
  pointIds: [EntityId, EntityId, EntityId, EntityId];
  construction: boolean;
}

export type Entity = PointEntity | LineEntity | CircleEntity | ArcEntity | RectEntity;

// ─── Constraint types ────────────────────────────────────────────────────────
export type ConstraintType =
  // Geometric
  | 'coincident'
  | 'collinear'
  | 'parallel'
  | 'perpendicular'
  | 'tangent'
  | 'equal'
  | 'symmetric'
  | 'horizontal'
  | 'vertical'
  | 'fixed'
  | 'midpoint'
  | 'pointOnLine'
  | 'pointOnCircle'
  | 'concentric'
  // Dimensional
  | 'distance'
  | 'horizontalDistance'
  | 'verticalDistance'
  | 'angle'
  | 'radius'
  | 'diameter';

export interface SketchConstraint {
  id: ConstraintId;
  type: ConstraintType;
  entityIds: EntityId[]; // which entities / points are involved
  value?: number;        // for dimensional constraints
  driving: boolean;      // true = drives geometry; false = driven/measured
  labelPos?: Vec2;       // where to draw the dimension label
}

// ─── Sketch state ─────────────────────────────────────────────────────────────
export interface SketchState {
  entities: Record<EntityId, Entity>;
  constraints: Record<ConstraintId, SketchConstraint>;
}

// ─── Snap result ─────────────────────────────────────────────────────────────
export type SnapType =
  | 'grid'
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'quadrant'
  | 'tangent'
  | 'intersection'
  | 'perpendicular'
  | 'nearest';

export interface SnapResult {
  point: Vec2;
  type: SnapType;
  entityId?: EntityId;
  entityId2?: EntityId; // for intersections
}

// ─── Viewport ────────────────────────────────────────────────────────────────
export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

// ─── Tool names ──────────────────────────────────────────────────────────────
export type ToolName =
  | 'select'
  | 'line'
  | 'circle'
  | 'arc'
  | 'rect'
  | 'polygon'
  | 'point'
  | 'construction'
  | 'trim'
  | 'dim';

// ─── Degree-of-freedom status (per entity/point) ─────────────────────────────
export type DofStatus = 'free' | 'constrained' | 'over-constrained';
