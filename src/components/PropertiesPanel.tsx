import { useSketchStore } from '../state/sketchStore';
import type { EntityId, PointEntity, LineEntity, CircleEntity, ArcEntity } from '../geometry/types';
import { dist } from '../geometry/mathUtils';

export function PropertiesPanel() {
  const entities = useSketchStore(s => s.entities);
  const selectedIds = useSketchStore(s => s.selectedIds);
  const movePoint = useSketchStore(s => s.movePoint);
  const updateRadius = useSketchStore(s => s.updateRadius);
  const toggleConstruction = useSketchStore(s => s.toggleConstruction);

  const selected = Array.from(selectedIds).map(id => entities[id]).filter(Boolean);
  if (selected.length === 0) return (
    <div style={styles.container}>
      <div style={styles.empty}>Select entities to view properties</div>
    </div>
  );

  function getLength(e: any): number | null {
    if (e.type === 'line') {
      const p1 = entities[e.p1Id] as PointEntity;
      const p2 = entities[e.p2Id] as PointEntity;
      if (!p1 || !p2) return null;
      return dist({ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y });
    }
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>Properties ({selected.length})</div>
      {selected.map(e => (
        <div key={e.id} style={styles.entity}>
          <div style={styles.entityType}>{e.type.charAt(0).toUpperCase() + e.type.slice(1)}</div>
          {e.type === 'point' && (
            <>
              <Row label="X" value={(e as PointEntity).x.toFixed(3)} onEdit={v => movePoint(e.id, parseFloat(v), (e as PointEntity).y)} />
              <Row label="Y" value={(e as PointEntity).y.toFixed(3)} onEdit={v => movePoint(e.id, (e as PointEntity).x, parseFloat(v))} />
            </>
          )}
          {e.type === 'line' && (() => {
            const p1 = entities[(e as LineEntity).p1Id] as PointEntity;
            const p2 = entities[(e as LineEntity).p2Id] as PointEntity;
            const len = getLength(e);
            return (
              <>
                {p1 && <Row label="X1" value={p1.x.toFixed(3)} />}
                {p1 && <Row label="Y1" value={p1.y.toFixed(3)} />}
                {p2 && <Row label="X2" value={p2.x.toFixed(3)} />}
                {p2 && <Row label="Y2" value={p2.y.toFixed(3)} />}
                {len !== null && <Row label="Length" value={len.toFixed(3)} />}
              </>
            );
          })()}
          {(e.type === 'circle') && (() => {
            const center = entities[(e as CircleEntity).centerId] as PointEntity;
            return (
              <>
                {center && <Row label="CX" value={center.x.toFixed(3)} />}
                {center && <Row label="CY" value={center.y.toFixed(3)} />}
                <Row label="Radius" value={(e as CircleEntity).radius.toFixed(3)} onEdit={v => updateRadius(e.id, parseFloat(v))} />
                <Row label="Diameter" value={((e as CircleEntity).radius * 2).toFixed(3)} />
              </>
            );
          })()}
          {(e.type === 'arc') && (() => {
            const center = entities[(e as ArcEntity).centerId] as PointEntity;
            const arc = e as ArcEntity;
            const sweep = ((arc.endAngle - arc.startAngle + 2 * Math.PI) % (2 * Math.PI)) * (180 / Math.PI);
            return (
              <>
                {center && <Row label="CX" value={center.x.toFixed(3)} />}
                {center && <Row label="CY" value={center.y.toFixed(3)} />}
                <Row label="Radius" value={arc.radius.toFixed(3)} onEdit={v => updateRadius(e.id, parseFloat(v))} />
                <Row label="Start°" value={(arc.startAngle * 180 / Math.PI).toFixed(1)} />
                <Row label="End°" value={(arc.endAngle * 180 / Math.PI).toFixed(1)} />
                <Row label="Sweep°" value={sweep.toFixed(1)} />
              </>
            );
          })()}
          <div style={styles.toggleRow}>
            <label style={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={e.construction}
                onChange={() => toggleConstruction(e.id)}
              />
              Construction
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit?: (v: string) => void }) {
  return (
    <div style={rowStyles.row}>
      <span style={rowStyles.label}>{label}</span>
      {onEdit ? (
        <input
          style={rowStyles.input}
          defaultValue={value}
          key={value}
          onBlur={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onEdit(String(v));
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      ) : (
        <span style={rowStyles.value}>{value}</span>
      )}
    </div>
  );
}

const rowStyles: Record<string, React.CSSProperties> = {
  row: { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' },
  label: { width: '52px', fontSize: '10px', color: '#888', flexShrink: 0 },
  value: { fontSize: '11px', color: '#ccc', fontFamily: 'monospace' },
  input: {
    flex: 1, background: '#1e1e1e', border: '1px solid #444', borderRadius: '3px',
    color: '#e0e0e0', fontSize: '11px', padding: '2px 4px', fontFamily: 'monospace',
    outline: 'none',
  },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '160px',
    background: '#252526',
    borderLeft: '1px solid #3a3a3a',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflowY: 'auto',
  },
  header: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#ccc',
    padding: '8px 10px',
    borderBottom: '1px solid #3a3a3a',
  },
  empty: {
    fontSize: '10px',
    color: '#555',
    padding: '12px 10px',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  entity: {
    padding: '6px 10px',
    borderBottom: '1px solid #2a2a2a',
  },
  entityType: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#7ac',
    marginBottom: '4px',
  },
  toggleRow: {
    marginTop: '4px',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '10px',
    color: '#888',
    cursor: 'pointer',
  },
};
