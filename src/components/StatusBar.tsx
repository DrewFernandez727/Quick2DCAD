import { useState } from 'react';
import { useSketchStore } from '../state/sketchStore';
import { SettingsPanel } from './SettingsPanel';
import { toDisplay, UNIT_LABELS } from '../geometry/units';

export function StatusBar() {
  const cursorPos = useSketchStore(s => s.cursorPos);
  const snapResult = useSketchStore(s => s.snapResult);
  const viewport = useSketchStore(s => s.viewport);
  const activeTool = useSketchStore(s => s.activeTool);
  const selectedIds = useSketchStore(s => s.selectedIds);
  const entities = useSketchStore(s => s.entities);
  const constraints = useSketchStore(s => s.constraints);
  const orthoActive = useSketchStore(s => s.orthoActive);
  const pendingConstraint = useSketchStore(s => s.pendingConstraint);
  const units = useSketchStore(s => s.units);

  const [showSettings, setShowSettings] = useState(false);

  const entityCount = Object.keys(entities).length;
  const constraintCount = Object.keys(constraints).length;
  const selectedCount = selectedIds.size;
  const zoomPct = Math.round(viewport.zoom * 2);

  const snapLabel = snapResult ? `Snap: ${snapResult.type}` : '';

  const TOOL_HINTS: Record<string, string> = {
    select: 'Click to select • Drag to box-select • Drag selected to move • Del to delete',
    line: 'Click to place start point • Click again to draw line • Right-click to cancel',
    circle: 'Click to place center • Click for radius',
    arc: 'Click center • Click radius • Click end angle',
    rect: 'Click first corner • Click opposite corner',
    polygon: 'Click center • Click radius (press 3–9 to change sides)',
    point: 'Click to place point',
    construction: 'Select entities to toggle construction geometry',
    trim: 'Hover over a line segment between intersections • Click to trim • Esc to cancel',
    dim: 'Click entity to dimension • (2nd click for second entity) • Move mouse to position • Click to place • Esc to cancel',
  };

  return (
    <div style={styles.bar}>
      <span style={styles.item} title="Active tool">
        <span style={styles.label}>Tool:</span> {activeTool}
      </span>
      <span style={styles.sep}>|</span>
      <span style={styles.item} title={`Cursor position (${UNIT_LABELS[units]})`}>
        X: <b>{toDisplay(cursorPos.x, units).toFixed(units === 'm' ? 4 : units === 'ft' ? 4 : 2)}</b>  Y: <b>{toDisplay(cursorPos.y, units).toFixed(units === 'm' ? 4 : units === 'ft' ? 4 : 2)}</b> <span style={{ color: '#666' }}>{UNIT_LABELS[units]}</span>
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

      {/* Pending constraint hint — replaces tool hint */}
      <span style={{ flex: 1 }} />
      {pendingConstraint ? (
        <span style={{ ...styles.item, color: '#4a9fcc', fontWeight: 500 }}>
          «{pendingConstraint.type}» — click {pendingConstraint.minEntities - pendingConstraint.collectedIds.length} more {pendingConstraint.minEntities - pendingConstraint.collectedIds.length === 1 ? 'entity' : 'entities'} (Esc to cancel)
        </span>
      ) : (
        <span style={{ ...styles.item, fontSize: '10px', color: '#555', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {TOOL_HINTS[activeTool]}
        </span>
      )}
      <span style={styles.sep}>|</span>
      <span style={styles.item} title="Scroll to zoom • Middle-drag or Space+drag to pan • Right-click to cancel">
        Scroll=zoom  Space=pan
      </span>
      <span style={styles.sep}>|</span>
      <button
        style={styles.settingsBtn}
        onClick={() => setShowSettings(v => !v)}
        title="UI settings"
      >⚙</button>
      {showSettings && <SettingsPanel />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    height: '28px',
    background: '#1a1a1a',
    borderTop: '1px solid #333',
    padding: '0 8px',
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
  settingsBtn: {
    background: 'transparent',
    border: 'none',
    color: '#666',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
    flexShrink: 0,
  },
};
