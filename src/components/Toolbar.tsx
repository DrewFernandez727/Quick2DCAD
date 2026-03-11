import { useSketchStore } from '../state/sketchStore';
import type { ToolName } from '../geometry/types';

interface ToolDef {
  name: ToolName;
  label: string;
  icon: string;
  shortcut: string;
}

const TOOLS: ToolDef[] = [
  { name: 'select',  label: 'Select',    icon: '↖', shortcut: 'S' },
  { name: 'line',    label: 'Line',      icon: '╱', shortcut: 'L' },
  { name: 'circle',  label: 'Circle',    icon: '○', shortcut: 'C' },
  { name: 'arc',     label: 'Arc',       icon: '◠', shortcut: 'A' },
  { name: 'rect',    label: 'Rectangle', icon: '□', shortcut: 'R' },
  { name: 'polygon', label: 'Polygon',   icon: '⬡', shortcut: 'G' },
  { name: 'point',   label: 'Point',     icon: '·', shortcut: 'P' },
  { name: 'trim',    label: 'Trim',      icon: '✂', shortcut: 'T' },
];

const ARC_MODES: { label: string; title: string }[] = [
  { label: 'C-R-E', title: 'Center → Radius → End angle' },
  { label: '3-Pt',  title: 'Start → Midpoint on arc → End (Tab)' },
  { label: 'S-C-E', title: 'Start → Center → End (Tab)' },
];

export function Toolbar() {
  const activeTool = useSketchStore(s => s.activeTool);
  const setActiveTool = useSketchStore(s => s.setActiveTool);
  const undo = useSketchStore(s => s.undo);
  const redo = useSketchStore(s => s.redo);
  const showGrid = useSketchStore(s => s.showGrid);
  const arcMode = useSketchStore(s => s.arcMode);
  const setArcMode = useSketchStore(s => s.setArcMode);
  const exportSketch = useSketchStore(s => s.exportSketch);
  const importSketch = useSketchStore(s => s.importSketch);
  const clearSketch = useSketchStore(s => s.clearSketch);
  const fitView = useSketchStore(s => s.fitView);

  const doFitView = () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const { entities, selectedIds } = useSketchStore.getState();
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : Object.keys(entities);
    fitView(ids, canvas.width, canvas.height);
  };

  const handleExport = () => {
    const json = exportSketch();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sketch.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => importSketch(ev.target?.result as string);
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div style={styles.container}>
      <div style={styles.section}>
        {TOOLS.map(t => (
          <div key={t.name}>
            <button
              onClick={() => setActiveTool(t.name)}
              style={{ ...styles.btn, ...(activeTool === t.name ? styles.btnActive : {}) }}
              title={`${t.label} (${t.shortcut})`}
            >
              <span style={styles.icon}>{t.icon}</span>
              <span style={styles.label}>{t.label}</span>
              <span style={styles.shortcut}>{t.shortcut}</span>
            </button>
            {t.name === 'arc' && activeTool === 'arc' && (
              <div style={styles.subBtns}>
                {ARC_MODES.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => setArcMode(i as 0 | 1 | 2)}
                    style={{ ...styles.subBtn, ...(arcMode === i ? styles.subBtnActive : {}) }}
                    title={m.title}
                  >{m.label}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={styles.divider} />

      <div style={styles.section}>
        <button onClick={undo} style={styles.btn} title="Undo (Ctrl+Z)">
          <span style={styles.icon}>↩</span><span style={styles.label}>Undo</span>
        </button>
        <button onClick={redo} style={styles.btn} title="Redo (Ctrl+Y)">
          <span style={styles.icon}>↪</span><span style={styles.label}>Redo</span>
        </button>
      </div>

      <div style={styles.divider} />

      <div style={styles.section}>
        <button onClick={doFitView} style={styles.btn} title="Fit view to geometry (F)">
          <span style={styles.icon}>⊙</span>
          <span style={styles.label}>Fit</span>
          <span style={styles.shortcut}>F</span>
        </button>
        <button
          onClick={() => useSketchStore.setState(s => ({ showGrid: !s.showGrid }))}
          style={{ ...styles.btn, ...(showGrid ? styles.btnActive : {}) }}
          title="Toggle Grid (Ctrl+G)"
        >
          <span style={styles.icon}>#</span><span style={styles.label}>Grid</span>
        </button>
      </div>

      <div style={styles.divider} />

      <div style={styles.section}>
        <button onClick={handleImport} style={styles.btn} title="Import JSON">
          <span style={styles.icon}>📂</span><span style={styles.label}>Open</span>
        </button>
        <button onClick={handleExport} style={styles.btn} title="Export JSON">
          <span style={styles.icon}>💾</span><span style={styles.label}>Save</span>
        </button>
        <button onClick={() => (window as any).__exportSVG?.()} style={styles.btn} title="Export SVG">
          <span style={styles.icon}>📤</span><span style={styles.label}>SVG</span>
        </button>
        <button
          onClick={() => { if (confirm('Clear all geometry?')) clearSketch(); }}
          style={{ ...styles.btn, color: '#ff6666' }}
          title="Clear sketch"
        >
          <span style={styles.icon}>🗑</span><span style={styles.label}>Clear</span>
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', minWidth: '72px',
    background: '#252526', borderRight: '1px solid #3a3a3a',
    padding: '4px 0', overflowY: 'auto', flexShrink: 0,
  },
  section: { display: 'flex', flexDirection: 'column', padding: '2px 4px', gap: '2px' },
  divider: { height: '1px', background: '#3a3a3a', margin: '4px 8px' },
  btn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%',
    padding: '6px 4px', borderRadius: '4px', background: 'transparent',
    color: '#ccc', fontSize: '12px', gap: '2px', cursor: 'pointer', border: 'none',
    boxSizing: 'border-box' as const,
  },
  btnActive: { background: '#0e639c', color: '#fff' },
  icon: { fontSize: '18px', lineHeight: 1 },
  label: { fontSize: '10px', opacity: 0.85, whiteSpace: 'nowrap' },
  shortcut: { fontSize: '9px', opacity: 0.45, fontFamily: 'monospace' },
  subBtns: {
    display: 'flex', flexDirection: 'column', gap: '3px',
    padding: '3px 4px', borderLeft: '2px solid #0e639c', marginLeft: '8px', marginRight: '4px',
  },
  subBtn: {
    padding: '3px 7px', borderRadius: '3px', background: '#1e1e1e',
    border: '1px solid #444', color: '#aaa', fontSize: '10px', cursor: 'pointer',
    textAlign: 'left' as const, whiteSpace: 'nowrap',
  },
  subBtnActive: { background: '#0e639c', color: '#fff', borderColor: '#0e639c' },
};
