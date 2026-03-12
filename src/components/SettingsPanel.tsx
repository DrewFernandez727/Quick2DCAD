import { useSketchStore } from '../state/sketchStore';
import { UnitSystem, UNIT_LABELS } from '../geometry/units';

const SCALE_PRESETS = [
  { label: '75%',  value: 0.75 },
  { label: '100%', value: 1.0  },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5  },
  { label: '175%', value: 1.75 },
];

const UNIT_OPTIONS: { label: string; value: UnitSystem }[] = [
  { label: 'mm', value: 'mm' },
  { label: 'cm', value: 'cm' },
  { label: 'm',  value: 'm'  },
  { label: 'in', value: 'in' },
  { label: 'ft', value: 'ft' },
];

export function SettingsPanel() {
  const uiScale = useSketchStore(s => s.uiScale);
  const setUiScale = useSketchStore(s => s.setUiScale);
  const units = useSketchStore(s => s.units);
  const setUnits = useSketchStore(s => s.setUnits);

  return (
    <div style={styles.panel}>
      <div style={styles.section}>
        <div style={styles.title}>Units</div>
        <div style={styles.presets}>
          {UNIT_OPTIONS.map(u => (
            <button
              key={u.value}
              style={{ ...styles.btn, ...(units === u.value ? styles.btnActive : {}) }}
              onClick={() => setUnits(u.value)}
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>
      <div style={styles.section}>
        <div style={styles.title}>UI Scale</div>
        <div style={styles.presets}>
          {SCALE_PRESETS.map(p => (
            <button
              key={p.value}
              style={{ ...styles.btn, ...(Math.abs(uiScale - p.value) < 0.01 ? styles.btnActive : {}) }}
              onClick={() => setUiScale(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    bottom: '36px',
    right: '8px',
    background: '#2d2d2d',
    border: '1px solid #4a4a4a',
    borderRadius: '6px',
    padding: '10px 12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    zIndex: 1000,
    minWidth: '200px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  title: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  presets: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
  btn: {
    padding: '4px 8px',
    borderRadius: '4px',
    background: '#1e1e1e',
    border: '1px solid #444',
    color: '#ccc',
    fontSize: '11px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnActive: {
    background: '#0e639c',
    color: '#fff',
    borderColor: '#0e639c',
  },
};
