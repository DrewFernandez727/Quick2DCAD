import { useSketchStore } from '../state/sketchStore';

export function StatusBar() {
  const cursorPos = useSketchStore(s => s.cursorPos);
  const snapResult = useSketchStore(s => s.snapResult);
  const viewport = useSketchStore(s => s.viewport);
  const activeTool = useSketchStore(s => s.activeTool);
  const selectedIds = useSketchStore(s => s.selectedIds);
  const entities = useSketchStore(s => s.entities);
  const constraints = useSketchStore(s => s.constraints);
  const solveStatus = useSketchStore(s => s.solveStatus);
  const orthoActive = useSketchStore(s => s.orthoActive);

  const entityCount = Object.keys(entities).length;
  const constraintCount = Object.keys(constraints).length;
  const selectedCount = selectedIds.size;
  const zoomPct = Math.round(viewport.zoom * 2); // approx screen px per 2 units

  const snapLabel = snapResult ? `Snap: ${snapResult.type}` : '';

  const TOOL_HINTS: Record<string, string> = {
    select: 'Click to select • Drag to box-select • Drag selected to move • Del to delete',
    line: 'Click to place start point • Click again to draw line • Right-click to cancel',
    circle: 'Click to place center • Click for radius',
    arc: 'Click center • Click radius • Click end angle',
    rect: 'Click first corner • Click opposite corner',
    polygon: 'Click center • Click radius (press 3-9 to change sides)',
    point: 'Click to place point',
    construction: 'Select entities to toggle construction geometry',
    trim: 'Hover over a line segment between intersections • Click to trim • Esc to cancel',
  };

  return (
    <div style={styles.bar}>
      <span style={styles.item} title="Active tool">
        <span style={styles.label}>Tool:</span> {activeTool}
      </span>
      <span style={styles.sep}>|</span>
      <span style={styles.item} title="Cursor position (mm)">
        X: <b>{cursorPos.x.toFixed(2)}</b>  Y: <b>{cursorPos.y.toFixed(2)}</b>
      </span>
      {snapLabel && (
        <>
          <span style={styles.sep}>|</span>
          <span style={{ ...styles.item, color: '#00ffcc' }}>{snapLabel}</span>
        </>
      )}
      <span style={styles.sep}>|</span>
      <span style={styles.item}>Zoom: {zoomPct}%</span>
      <span style={styles.sep}>|</span>
      <span style={styles.item}>Entities: {entityCount}</span>
      <span style={styles.sep}>|</span>
      <span style={styles.item}>Constraints: {constraintCount}</span>
      {selectedCount > 0 && (
        <>
          <span style={styles.sep}>|</span>
          <span style={{ ...styles.item, color: '#00ccff' }}>Selected: {selectedCount}</span>
        </>
      )}
      {orthoActive && (
        <>
          <span style={styles.sep}>|</span>
          <span style={{ ...styles.item, color: '#ffd700', fontWeight: 'bold' }}>ORTHO</span>
        </>
      )}
      <span style={styles.sep}>|</span>
      <span style={{ ...styles.item, color: '#555', fontSize: '10px' }} title="Hold Alt while drawing to disable auto-constraints">AUTO</span>
      <span style={{ flex: 1 }} />
      <span style={{ ...styles.item, fontSize: '10px', color: '#555', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {TOOL_HINTS[activeTool]}
      </span>
      <span style={styles.sep}>|</span>
      <span style={styles.item} title="Scroll to zoom • Middle-drag or Space+drag to pan • Right-click to cancel">
        Scroll=zoom  Space=pan
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    height: '24px',
    background: '#1a1a1a',
    borderTop: '1px solid #333',
    padding: '0 10px',
    gap: '8px',
    flexShrink: 0,
    overflow: 'hidden',
  },
  item: {
    fontSize: '11px',
    color: '#888',
    whiteSpace: 'nowrap',
  },
  label: {
    color: '#666',
  },
  sep: {
    color: '#333',
    fontSize: '11px',
  },
};
