import { useSketchStore } from '../state/sketchStore';
import type { ToolName } from '../geometry/types';

interface ToolDef {
  name: ToolName;
  label: string;
  icon: string;
  shortcut: string;
}

const TOOLS: ToolDef[] = [
  { name: 'select',  label: 'Select',   icon: '↖',  shortcut: 'S' },
  { name: 'line',    label: 'Line',     icon: '╱',  shortcut: 'L' },
  { name: 'circle',  label: 'Circle',   icon: '○',  shortcut: 'C' },
  { name: 'arc',     label: 'Arc',      icon: '◠',  shortcut: 'A' },
  { name: 'rect',    label: 'Rectangle',icon: '□',  shortcut: 'R' },
  { name: 'polygon', label: 'Polygon',  icon: '⬡',  shortcut: 'G' },
  { name: 'point',   label: 'Point',    icon: '·',  shortcut: 'P' },
];

export function Toolbar() {
  const activeTool = useSketchStore(s => s.activeTool);
  const setActiveTool = useSketchStore(s => s.setActiveTool);
  const undo = useSketchStore(s => s.undo);
  const redo = useSketchStore(s => s.redo);
  const resetView = useSketchStore(s => s.resetView);
  const clearSketch = useSketchStore(s => s.clearSketch);
  const exportSketch = useSketchStore(s => s.exportSketch);
  const importSketch = useSketchStore(s => s.importSketch);
  const showGrid = useSketchStore(s => s.showGrid);

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

  const handleExportSVG = () => {
    // Trigger SVG export via global function set in App
    (window as any).__exportSVG?.();
  };

  return (
    <div style={styles.container}>
      {/* Drawing tools */}
      <div style={styles.section}>
        {TOOLS.map(t => (
          <button
            key={t.name}
            onClick={() => setActiveTool(t.name)}
            style={{ ...styles.btn, ...(activeTool === t.name ? styles.btnActive : {}) }}
            title={`${t.label} (${t.shortcut})`}
          >
            <span style={styles.icon}>{t.icon}</span>
            <span style={styles.label}>{t.label}</span>
            <span style={styles.shortcut}>{t.shortcut}</span>
          </button>
        ))}
      </div>

      <div style={styles.divider} />

      {/* Edit actions */}
      <div style={styles.section}>
        <button onClick={undo} style={styles.btn} title="Undo (Ctrl+Z)">
          <span style={styles.icon}>↩</span><span style={styles.label}>Undo</span>
        </button>
        <button onClick={redo} style={styles.btn} title="Redo (Ctrl+Y)">
          <span style={styles.icon}>↪</span><span style={styles.label}>Redo</span>
        </button>
      </div>

      <div style={styles.divider} />

      {/* View */}
      <div style={styles.section}>
        <button onClick={resetView} style={styles.btn} title="Reset View">
          <span style={styles.icon}>⊙</span><span style={styles.label}>Fit</span>
        </button>
        <button
          onClick={() => useSketchStore.setState(s => ({ showGrid: !s.showGrid }))}
          style={{ ...styles.btn, ...(showGrid ? styles.btnActive : {}) }}
          title="Toggle Grid"
        >
          <span style={styles.icon}>#</span><span style={styles.label}>Grid</span>
        </button>
      </div>

      <div style={styles.divider} />

      {/* File */}
      <div style={styles.section}>
        <button onClick={handleImport} style={styles.btn} title="Import JSON">
          <span style={styles.icon}>📂</span><span style={styles.label}>Open</span>
        </button>
        <button onClick={handleExport} style={styles.btn} title="Export JSON">
          <span style={styles.icon}>💾</span><span style={styles.label}>Save</span>
        </button>
        <button onClick={handleExportSVG} style={styles.btn} title="Export SVG">
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
    display: 'flex',
    flexDirection: 'column',
    width: '68px',
    background: '#252526',
    borderRight: '1px solid #3a3a3a',
    padding: '4px 0',
    overflowY: 'auto',
    flexShrink: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    padding: '2px 4px',
    gap: '2px',
  },
  divider: {
    height: '1px',
    background: '#3a3a3a',
    margin: '4px 8px',
  },
  btn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '6px 2px',
    borderRadius: '4px',
    background: 'transparent',
    color: '#ccc',
    fontSize: '11px',
    gap: '2px',
    transition: 'background 0.1s',
    cursor: 'pointer',
    border: 'none',
  },
  btnActive: {
    background: '#0e639c',
    color: '#fff',
  },
  icon: {
    fontSize: '18px',
    lineHeight: 1,
  },
  label: {
    fontSize: '9px',
    opacity: 0.8,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    maxWidth: '60px',
    textOverflow: 'ellipsis',
  },
  shortcut: {
    fontSize: '8px',
    opacity: 0.5,
    fontFamily: 'monospace',
  },
};
