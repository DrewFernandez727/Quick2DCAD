import { useSketchStore } from '../state/sketchStore';
import type { SnapOptions } from '../geometry/snap';

const SNAP_LABELS: { key: keyof SnapOptions; label: string; icon: string }[] = [
  { key: 'grid',         label: 'Grid',         icon: '#' },
  { key: 'endpoint',     label: 'Endpoint',     icon: '□' },
  { key: 'midpoint',     label: 'Midpoint',     icon: '△' },
  { key: 'center',       label: 'Center',       icon: '◎' },
  { key: 'quadrant',     label: 'Quadrant',     icon: '◇' },
  { key: 'intersection', label: 'Intersect',    icon: '✕' },
  { key: 'nearest',      label: 'Nearest',      icon: '○' },
];

const GRID_SIZES = [1, 5, 10, 25, 50];

export function SnapOptionsPanel() {
  const snapOptions = useSketchStore(s => s.snapOptions);
  const setSnapOptions = useSketchStore(s => s.setSnapOptions);
  const gridSize = useSketchStore(s => s.gridSize);
  const setGridSize = useSketchStore(s => s.setGridSize);
  const showGrid = useSketchStore(s => s.showGrid);

  return (
    <div style={styles.container}>
      <div style={styles.header}>Snap</div>
      {SNAP_LABELS.map(({ key, label, icon }) => (
        <label key={key} style={styles.row} title={`Toggle ${label} snap`}>
          <input
            type="checkbox"
            checked={snapOptions[key]}
            onChange={() => setSnapOptions({ [key]: !snapOptions[key] })}
            style={styles.check}
          />
          <span style={styles.icon}>{icon}</span>
          <span style={styles.label}>{label}</span>
        </label>
      ))}
      {/* Grid size presets */}
      <div style={styles.gridRow}>
        <span style={styles.gridLabel}>Grid (mm)</span>
        <div style={styles.gridBtns}>
          {GRID_SIZES.map(s => (
            <button
              key={s}
              onClick={() => setGridSize(s)}
              style={{
                ...styles.gridBtn,
                ...(gridSize === s && showGrid ? styles.gridBtnActive : {}),
              }}
              title={`${s}mm grid`}
            >{s}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#252526',
    borderBottom: '1px solid #3a3a3a',
    padding: '4px 0',
  },
  header: {
    fontSize: '9px',
    color: '#666',
    padding: '4px 10px 2px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '2px 10px',
    cursor: 'pointer',
    fontSize: '10px',
    color: '#aaa',
  },
  check: { cursor: 'pointer', flexShrink: 0 },
  icon: { fontSize: '11px', width: '14px', textAlign: 'center', flexShrink: 0 },
  label: {},
  gridRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '4px 10px 6px',
    gap: '4px',
  },
  gridLabel: { fontSize: '9px', color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  gridBtns: { display: 'flex', gap: '3px' },
  gridBtn: {
    flex: 1,
    padding: '2px 0',
    background: '#1e1e1e',
    border: '1px solid #444',
    borderRadius: '3px',
    color: '#888',
    fontSize: '9px',
    cursor: 'pointer',
  },
  gridBtnActive: {
    background: '#0e639c',
    color: '#fff',
    borderColor: '#0e639c',
  },
};
