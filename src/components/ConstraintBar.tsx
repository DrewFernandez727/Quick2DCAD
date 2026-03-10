import { useSketchStore } from '../state/sketchStore';
import type { ConstraintType } from '../geometry/types';
import { solve, solveSimple } from '../solver/ConstraintSolver';

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

function applyConstraint(type: ConstraintType, minEntities: number) {
  const store = useSketchStore.getState();
  const selected = Array.from(store.selectedIds);

  if (selected.length < minEntities) {
    alert(`Select at least ${minEntities} entit${minEntities === 1 ? 'y' : 'ies'} first.`);
    return;
  }

  const isDimensional = ['distance','horizontalDistance','verticalDistance','angle','radius','diameter'].includes(type);

  if (isDimensional) {
    // First add the constraint, then open dialog for value
    const id = store.addConstraint({
      type,
      entityIds: selected,
      driving: true,
      value: undefined,
    });
    store.openDimensionDialog(id);
  } else {
    store.pushHistory();
    store.addConstraint({
      type,
      entityIds: selected,
      driving: true,
    });
    try { solve(); } catch { solveSimple(); }
  }
}

export function ConstraintBar() {
  const selectedIds = useSketchStore(s => s.selectedIds);
  const solveStatus = useSketchStore(s => s.solveStatus);

  const statusColor = solveStatus === 'ok' ? '#4ec94e' : solveStatus === 'redundant' ? '#f5c842' : '#ff4444';
  const statusLabel = solveStatus === 'ok' ? 'Solved' : solveStatus === 'redundant' ? 'Redundant' : 'Over-constrained';

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
            style={styles.btn}
            title={c.tooltip}
          >
            <span style={styles.icon}>{c.icon}</span>
            <span style={styles.label}>{c.label}</span>
          </button>
        ))}
      </div>

      <div style={styles.sectionLabel}>Dimensional</div>
      <div style={styles.grid}>
        {DIMENSIONAL_CONSTRAINTS.map(c => (
          <button
            key={c.type}
            onClick={() => applyConstraint(c.type, c.minEntities)}
            style={styles.btn}
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

  const list = Object.values(constraints);
  if (list.length === 0) return null;

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
              <button
                style={styles.dimValue}
                onClick={() => openDimensionDialog(c.id, c.value)}
                title="Edit value"
              >
                {c.value.toFixed(2)}
              </button>
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
};
