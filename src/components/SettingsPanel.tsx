import { useSketchStore } from '../state/sketchStore';

const SCALE_PRESETS = [
  { label: '75%',  value: 0.75 },
  { label: '100%', value: 1.0  },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5  },
  { label: '175%', value: 1.75 },
];

export function SettingsPanel() {
  const uiScale = useSketchStore(s => s.uiScale);
  const setUiScale = useSketchStore(s => s.setUiScale);

  return (
    <div style={styles.panel}>
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
    minWidth: '180px',
  },
  title: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#aaa',
    marginBottom: '8px',
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
