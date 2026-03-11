import { useState } from 'react';
import { useSketchStore } from '../state/sketchStore';
import { analyzeShapes, totalProperties, ShapeResult } from '../geometry/shapeAnalysis';

function fmt(n: number | null, decimals = 3): string {
  if (n === null) return '—';
  if (!isFinite(n)) return '—';
  // Use scientific notation for very large/small values
  if (Math.abs(n) > 0 && (Math.abs(n) > 999999 || (Math.abs(n) < 0.001))) {
    return n.toExponential(2);
  }
  return n.toFixed(decimals);
}

function ShapeCard({ shape }: { shape: ShapeResult }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{shape.label}</div>
      {shape.radius !== undefined && (
        <Row label="Radius" value={`${fmt(shape.radius)} mm`} />
      )}
      {shape.sweepDeg !== undefined && (
        <Row label="Sweep" value={`${fmt(shape.sweepDeg, 1)}°`} />
      )}
      <Row label="Area" value={`${fmt(shape.area)} mm²`} />
      <Row
        label={shape.type === 'circle' ? 'Circumf.' : shape.type === 'arc' ? 'Arc len.' : 'Perimeter'}
        value={`${fmt(shape.perimeter)} mm`}
      />
      <Row label="Centroid X" value={`${fmt(shape.centroid.x)} mm`} />
      <Row label="Centroid Y" value={`${fmt(shape.centroid.y)} mm`} />
      <div style={styles.divider} />
      <div style={styles.momentTitle}>Centroidal axes</div>
      <Row label="I_xx" value={shape.ixx !== null ? `${fmt(shape.ixx)} mm⁴` : '—'} />
      <Row label="I_yy" value={shape.iyy !== null ? `${fmt(shape.iyy)} mm⁴` : '—'} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={styles.rowValue}>{value}</span>
    </div>
  );
}

export function InspectPanel() {
  const entities = useSketchStore(s => s.entities);
  const [open, setOpen] = useState(true);

  const shapes = analyzeShapes(entities);
  const totals = shapes.length > 1 ? totalProperties(shapes) : null;

  return (
    <div style={styles.container}>
      {/* Header / toggle */}
      <button style={styles.header} onClick={() => setOpen(o => !o)}>
        <span>Inspect</span>
        <span style={styles.chevron}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={styles.body}>
          {shapes.length === 0 ? (
            <div style={styles.empty}>
              No closed shapes detected.
              <br />
              Connect lines to form a polygon, or add circles/arcs.
            </div>
          ) : (
            <>
              {shapes.map(s => <ShapeCard key={s.id} shape={s} />)}

              {/* Totals row when multiple shapes */}
              {totals && (
                <div style={styles.totals}>
                  <div style={styles.totalsTitle}>Combined ({shapes.length} shapes)</div>
                  <Row label="Total area" value={`${fmt(totals.totalArea)} mm²`} />
                  <Row label="I_xx (origin)" value={`${fmt(totals.ixxOrigin)} mm⁴`} />
                  <Row label="I_yy (origin)" value={`${fmt(totals.iyyOrigin)} mm⁴`} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '160px',
    background: '#252526',
    borderLeft: '1px solid #3a3a3a',
    borderTop: '1px solid #3a3a3a',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 10px',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid #3a3a3a',
    color: '#ccc',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  },
  chevron: {
    fontSize: '8px',
    color: '#666',
  },
  body: {
    overflowY: 'auto',
    flex: 1,
  },
  empty: {
    fontSize: '10px',
    color: '#555',
    padding: '10px',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: '1.5',
  },
  card: {
    padding: '6px 10px',
    borderBottom: '1px solid #2a2a2a',
  },
  cardTitle: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#7ac',
    marginBottom: '4px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '4px',
    padding: '1px 0',
  },
  rowLabel: {
    fontSize: '9px',
    color: '#777',
    flexShrink: 0,
  },
  rowValue: {
    fontSize: '10px',
    color: '#ccc',
    fontFamily: 'monospace',
    textAlign: 'right',
    wordBreak: 'break-all',
  },
  divider: {
    borderTop: '1px solid #333',
    margin: '4px 0',
  },
  momentTitle: {
    fontSize: '9px',
    color: '#666',
    fontStyle: 'italic',
    marginBottom: '2px',
  },
  totals: {
    padding: '6px 10px',
    background: '#2a2a2c',
    borderTop: '1px solid #3a3a3a',
  },
  totalsTitle: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#aaa',
    marginBottom: '4px',
  },
};
