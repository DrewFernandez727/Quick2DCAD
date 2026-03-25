import { useSketchStore } from '../state/sketchStore';
import type { ConstraintType } from '../geometry/types';
import { solve, solveSimple } from '../solver/ConstraintSolver';
import { formatLength, formatAngle } from '../geometry/units';
import type { DimMode } from '../tools/DimensionTool';

const DIM_MODES: { mode: DimMode; label: string; icon: string; title: string }[] = [
  { mode: 'smart',      label: 'Smart',   icon: '★', title: 'Smart Dimension — auto-detects type' },
  { mode: 'linear',     label: 'Linear',  icon: '↔', title: 'Aligned linear distance' },
  { mode: 'horizontal', label: 'Horiz',   icon: '⇔', title: 'Horizontal distance' },
  { mode: 'vertical',   label: 'Vert',    icon: '⇕', title: 'Vertical distance' },
  { mode: 'angle',      label: 'Angle',   icon: '∠', title: 'Angle between two lines' },
  { mode: 'radius',     label: 'Radius',  icon: 'R',  title: 'Radius of arc or circle' },
  { mode: 'diameter',   label: 'Diam',    icon: '⌀', title: 'Diameter of circle' },
];

interface ConstraintDef {
  type: ConstraintType;
  label: string;
  icon: string;
  minEntities: number;
  tooltip: string;
}

const GEOMETRIC_CONSTRAINTS: ConstraintDef[] = [
  { type: 'coincident',    label: 'Coincident',    icon: '●',  minEntities: 2, tooltip: 'Coincident: 2 points share the same position' },
  { type: 'collinear',     label: 'Collinear',     icon: '⟶',  minEntities: 2, tooltip: 'Collinear: 2 lines are collinear' },
  { type: 'parallel',      label: 'Parallel',      icon: '∥',  minEntities: 2, tooltip: 'Parallel: 2 lines are parallel' },
  { type: 'perpendicular', label: 'Perpendicular', icon: '⊥',  minEntities: 2, tooltip: 'Perpendicular: 2 lines are perpendicular' },
  { type: 'tangent',       label: 'Tangent',       icon: 'T',  minEntities: 2, tooltip: 'Tangent: line/arc is tangent to circle/arc' },
  { type: 'equal',         label: 'Equal',         icon: '=',  minEntities: 2, tooltip: 'Equal: same length or radius' },
  { type: 'symmetric',     label: 'Symmetric',     icon: '⟺',  minEntities: 3, tooltip: 'Symmetric: 2 entities symmetric about a line' },
  { type: 'horizontal',    label: 'Horizontal',    icon: '—',  minEntities: 1, tooltip: 'Horizontal: line is horizontal' },
  { type: 'vertical',      label: 'Vertical',      icon: '|',  minEntities: 1, tooltip: 'Vertical: line is vertical' },
  { type: 'fixed',         label: 'Fixed',         icon: '🔒', minEntities: 1, tooltip: 'Fix entity position' },
  { type: 'midpoint',      label: 'Midpoint',      icon: 'M',  minEntities: 2, tooltip: 'Point at midpoint of line' },
  { type: 'pointOnLine',   label: 'On Line',       icon: '◇',  minEntities: 2, tooltip: 'Point lies on a line' },
  { type: 'pointOnCircle', label: 'On Circle',     icon: '◯',  minEntities: 2, tooltip: 'Point lies on a circle/arc' },
  { type: 'concentric',    label: 'Concentric',    icon: '⊙',  minEntities: 2, tooltip: 'Concentric: two circles/arcs share center' },
];

const DIMENSIONAL_CONSTRAINTS: ConstraintDef[] = [
  { type: 'distance',           label: 'Distance',    icon: '↔',  minEntities: 2, tooltip: 'Distance between two points' },
  { type: 'horizontalDistance', label: 'H-Dist',      icon: '⇔',  minEntities: 2, tooltip: 'Horizontal distance between two points' },
  { type: 'verticalDistance',   label: 'V-Dist',      icon: '⇕',  minEntities: 2, tooltip: 'Vertical distance between two points' },
  { type: 'angle',              label: 'Angle',       icon: '∠',  minEntities: 2, tooltip: 'Angle between two lines' },
  { type: 'radius',             label: 'Radius',      icon: 'R',  minEntities: 1, tooltip: 'Radius of circle or arc' },
  { type: 'diameter',           label: 'Diameter',    icon: '⌀',  minEntities: 1, tooltip: 'Diameter of circle' },
];

export function applyConstraintToIds(type: ConstraintType, entityIds: string[]) {
  const store = useSketchStore.getState();
  const isDimensional = ['distance','horizontalDistance','verticalDistance','angle','radius','diameter'].includes(type);
  if (isDimensional) {
    const id = store.addConstraint({ type, entityIds, driving: true, value: undefined });
    store.openDimensionDialog(id);
  } else {
    store.pushHistory();
    store.addConstraint({ type, entityIds, driving: true });
    try { solve(); } catch { solveSimple(); }
  }
}

function applyConstraint(type: ConstraintType, minEntities: number) {
  const store = useSketchStore.getState();
  const selected = Array.from(store.selectedIds);

  if (selected.length >= minEntities) {
    applyConstraintToIds(type, selected);
    return;
  }

  // Not enough selected — enter picking mode
  store.setPendingConstraint({ type, minEntities });
  store.setActiveTool('select');
}

export function ConstraintBar() {
  const solveStatus = useSketchStore(s => s.solveStatus);
  const pendingConstraint = useSketchStore(s => s.pendingConstraint);
  const activeTool = useSketchStore(s => s.activeTool);
  const setActiveTool = useSketchStore(s => s.setActiveTool);
  const dimMode = useSketchStore(s => s.dimMode);
  const setDimMode = useSketchStore(s => s.setDimMode);

  const isDimActive = activeTool === 'dim';

  const statusColor = solveStatus === 'ok' ? '#4ec94e' : solveStatus === 'redundant' ? '#f5c842' : '#ff4444';
  const statusLabel = solveStatus === 'ok' ? 'Solved' : solveStatus === 'redundant' ? 'Redundant' : 'Over-constrained';

  const btnStyle = (type: ConstraintType) => ({
    ...styles.btn,
    ...(pendingConstraint?.type === type ? styles.btnPending : {}),
  });

  const activateDimTool = (mode: DimMode) => {
    (window as any).__cancelActiveTool?.();
    useSketchStore.getState().setPendingConstraint(null);
    setDimMode(mode);
    setActiveTool('dim');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Constraints</span>
        <span style={{ ...styles.statusDot, background: statusColor }} title={statusLabel} />
        <span style={{ fontSize: '9px', color: statusColor }}>{statusLabel}</span>
      </div>

      <div style={styles.sectionLabel}>Geometric</div>
      <div style={styles.grid}>
        {GEOMETRIC_CONSTRAINTS.map(c => (
          <button
            key={c.type}
            onClick={() => applyConstraint(c.type, c.minEntities)}
            style={btnStyle(c.type)}
            title={c.tooltip}
          >
            <span style={styles.icon}>{c.icon}</span>
            <span style={styles.label}>{c.label}</span>
          </button>
        ))}
      </div>

      <div style={styles.sectionLabel}>Dimensional</div>

      {/* Smart Dimension canvas-picker button */}
      <div style={styles.dimPickerRow}>
        <button
          onClick={() => activateDimTool(isDimActive ? dimMode : 'smart')}
          style={{ ...styles.smartDimBtn, ...(isDimActive ? styles.smartDimBtnActive : {}) }}
          title="Smart Dimension — click entities on the canvas to place a dimension"
        >
          <span style={{ fontSize: '13px' }}>★</span>
          <span style={{ fontSize: '10px' }}>{isDimActive ? `${DIM_MODES.find(m => m.mode === dimMode)?.label ?? 'Smart'} Dim (active)` : 'Smart Dim'}</span>
        </button>
      </div>

      {/* Dim mode sub-buttons when dim tool is active */}
      {isDimActive && (
        <div style={styles.dimModeGrid}>
          {DIM_MODES.map(m => (
            <button
              key={m.mode}
              onClick={() => activateDimTool(m.mode)}
              style={{ ...styles.dimModeBtn, ...(dimMode === m.mode ? styles.dimModeBtnActive : {}) }}
              title={m.title}
            >
              <span style={{ fontSize: '11px' }}>{m.icon}</span>
              <span style={{ fontSize: '7px' }}>{m.label}</span>
            </button>
          ))}
        </div>
      )}

      <div style={styles.grid}>
        {DIMENSIONAL_CONSTRAINTS.map(c => (
          <button
            key={c.type}
            onClick={() => applyConstraint(c.type, c.minEntities)}
            style={btnStyle(c.type)}
            title={c.tooltip}
          >
            <span style={styles.icon}>{c.icon}</span>
            <span style={styles.label}>{c.label}</span>
          </button>
        ))}
      </div>

      <ConstraintList />
    </div>
  );
}

function ConstraintList() {
  const constraints = useSketchStore(s => s.constraints);
  const overconstrained = useSketchStore(s => s.overconstrained);
  const removeConstraint = useSketchStore(s => s.removeConstraint);
  const openDimensionDialog = useSketchStore(s => s.openDimensionDialog);
  const toggleConstraintDriving = useSketchStore(s => s.toggleConstraintDriving);
  const units = useSketchStore(s => s.units);

  const list = Object.values(constraints);
  if (list.length === 0) return null;

  function dimValueLabel(c: (typeof list)[0]): string {
    if (c.value === undefined) return '';
    if (c.type === 'angle') return formatAngle(c.value);
    if (c.type === 'diameter') return `⌀${formatLength(c.value, units)}`;
    if (c.type === 'radius') return `R${formatLength(c.value, units)}`;
    return formatLength(c.value, units);
  }

  return (
    <div style={styles.listSection}>
      <div style={styles.sectionLabel}>Applied ({list.length})</div>
      <div style={styles.list}>
        {list.map(c => (
          <div key={c.id} style={{ ...styles.listItem, ...(overconstrained.has(c.id) ? styles.listItemOC : {}) }}>
            <span style={styles.listIcon}>
              {c.type === 'coincident' ? '●' : c.type === 'parallel' ? '∥' : c.type === 'perpendicular' ? '⊥' :
               c.type === 'horizontal' ? '—' : c.type === 'vertical' ? '|' : c.type === 'tangent' ? 'T' :
               c.type === 'equal' ? '=' : c.type === 'fixed' ? '🔒' : c.type === 'distance' ? '↔' :
               c.type === 'radius' ? 'R' : c.type === 'diameter' ? '⌀' : c.type === 'angle' ? '∠' : '?'}
            </span>
            <span style={styles.listType}>{c.type}</span>
            {c.value !== undefined && (
              <>
                <button
                  style={styles.dimValue}
                  onClick={() => openDimensionDialog(c.id, c.value)}
                  title="Edit dimension value"
                >
                  {c.driving ? dimValueLabel(c) : `(${dimValueLabel(c)})`}
                </button>
                <button
                  style={{ ...styles.drivingBtn, ...(c.driving ? styles.drivingBtnOn : styles.drivingBtnOff) }}
                  onClick={() => { useSketchStore.getState().pushHistory(); toggleConstraintDriving(c.id); try { solve(); } catch { solveSimple(); } }}
                  title={c.driving ? 'Driving — click to make reference' : 'Reference — click to make driving'}
                >
                  {c.driving ? 'D' : 'R'}
                </button>
              </>
            )}
            <button
              style={styles.deleteBtn}
              onClick={() => removeConstraint(c.id)}
              title="Remove constraint"
            >×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '180px',
    background: '#252526',
    borderLeft: '1px solid #3a3a3a',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 10px 4px',
    borderBottom: '1px solid #3a3a3a',
  },
  headerTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#ccc',
    flex: 1,
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  sectionLabel: {
    fontSize: '9px',
    color: '#666',
    padding: '6px 10px 2px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '2px',
    padding: '2px 6px',
  },
  dimPickerRow: {
    padding: '2px 6px',
  },
  smartDimBtn: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    padding: '5px 8px',
    borderRadius: '3px',
    background: '#2d2d2d',
    border: '1px solid #3a3a3a',
    color: '#ccc',
    cursor: 'pointer',
    fontSize: '10px',
  },
  smartDimBtnActive: {
    background: '#0e639c',
    border: '1px solid #4a9fcc',
    color: '#fff',
  },
  dimModeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '2px',
    padding: '2px 6px 4px',
    borderLeft: '2px solid #0e639c',
    marginLeft: '10px',
    marginRight: '6px',
  },
  dimModeBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '4px 2px',
    borderRadius: '3px',
    background: '#1e1e1e',
    border: '1px solid #444',
    color: '#aaa',
    cursor: 'pointer',
    gap: '2px',
  },
  dimModeBtnActive: {
    background: '#0e639c',
    color: '#fff',
    borderColor: '#0e639c',
  },
  btn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '5px 2px',
    borderRadius: '3px',
    background: '#2d2d2d',
    border: '1px solid #3a3a3a',
    color: '#ccc',
    cursor: 'pointer',
    fontSize: '10px',
    gap: '2px',
  },
  btnPending: {
    background: '#1a6fa8',
    border: '1px solid #4a9fcc',
    color: '#fff',
  },
  icon: { fontSize: '13px', lineHeight: 1 },
  label: { fontSize: '7px', opacity: 0.7 },
  listSection: {
    borderTop: '1px solid #3a3a3a',
    marginTop: '4px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    padding: '2px 6px',
    gap: '2px',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 4px',
    borderRadius: '3px',
    background: '#2d2d2d',
    fontSize: '10px',
    color: '#ccc',
  },
  listItemOC: {
    borderLeft: '2px solid #ff4444',
  },
  listIcon: { fontSize: '11px', flexShrink: 0 },
  listType: { flex: 1, fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dimValue: {
    background: '#1a6fa8',
    border: 'none',
    borderRadius: '2px',
    color: '#fff',
    fontSize: '9px',
    padding: '1px 4px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#666',
    cursor: 'pointer',
    fontSize: '12px',
    lineHeight: 1,
    padding: '0 2px',
    flexShrink: 0,
  },
  drivingBtn: {
    border: 'none',
    borderRadius: '2px',
    fontSize: '8px',
    fontWeight: 700,
    padding: '1px 3px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  drivingBtnOn: {
    background: '#f5c842',
    color: '#000',
  },
  drivingBtnOff: {
    background: '#555',
    color: '#aaa',
  },
};
