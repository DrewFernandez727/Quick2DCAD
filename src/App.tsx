import { useEffect } from 'react';
import { useSketchStore } from './state/sketchStore';
import { SketchCanvas } from './canvas/SketchCanvas';
import { Toolbar } from './components/Toolbar';
import { ConstraintBar } from './components/ConstraintBar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { InspectPanel } from './components/InspectPanel';
import { StatusBar } from './components/StatusBar';
import { SnapOptionsPanel } from './components/SnapOptions';
import { DimensionDialog } from './components/DimensionDialog';
import { initSolver } from './solver/ConstraintSolver';
import { screenToWorld } from './canvas/renderer';

export default function App() {
  const uiScale = useSketchStore(s => s.uiScale);

  // Initialise solver on mount
  useEffect(() => {
    initSolver().catch(console.error);
  }, []);

  // Register SVG export
  useEffect(() => {
    (window as any).__exportSVG = exportSVG;
    return () => { delete (window as any).__exportSVG; };
  }, []);

  return (
    <div style={layoutStyles.root}>
      {/* Top bar */}
      <div style={layoutStyles.topBar}>
        <span style={layoutStyles.logo}>⬡ Quick2DCAD</span>
        <span style={layoutStyles.hint}>
          L=Line  C=Circle  A=Arc  R=Rect  G=Polygon  P=Point  S=Select  Esc=Cancel
        </span>
        <span style={layoutStyles.hint}>Ctrl+Z=Undo  Ctrl+Y=Redo  Del=Delete</span>
      </div>

      {/* Main body */}
      <div style={layoutStyles.body}>
        {/* Left toolbar — scaled */}
        <div style={{ zoom: uiScale, flexShrink: 0, display: 'flex' }}>
          <Toolbar />
        </div>

        {/* Canvas area — never scaled so coordinate mapping stays correct */}
        <div style={layoutStyles.canvasArea}>
          <SketchCanvas />
        </div>

        {/* Right panel — scaled */}
        <div style={{ zoom: uiScale, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          <SnapOptionsPanel />
          <ConstraintBar />
          <PropertiesPanel />
          <InspectPanel />
        </div>
      </div>

      {/* Status bar — scaled */}
      <div style={{ zoom: uiScale }}>
        <StatusBar />
      </div>

      {/* Dimension input dialog (modal) */}
      <DimensionDialog />
    </div>
  );
}

function exportSVG() {
  const { entities, viewport } = useSketchStore.getState();

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of Object.values(entities)) {
    if (e.type === 'point') {
      minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x); maxY = Math.max(maxY, e.y);
    }
  }
  if (!isFinite(minX)) { minX = -100; minY = -100; maxX = 100; maxY = 100; }
  const pad = 20;
  const vbX = minX - pad, vbY = -(maxY + pad);
  const vbW = (maxX - minX) + pad * 2;
  const vbH = (maxY - minY) + pad * 2;

  const lines: string[] = [];
  for (const e of Object.values(entities)) {
    const color = e.construction ? '#4488cc' : '#d4d4d4';
    const dash = e.construction ? 'stroke-dasharray="6 4"' : '';
    switch (e.type) {
      case 'line': {
        const p1 = entities[e.p1Id] as any;
        const p2 = entities[e.p2Id] as any;
        if (!p1 || !p2) break;
        lines.push(`<line x1="${p1.x}" y1="${-p1.y}" x2="${p2.x}" y2="${-p2.y}" stroke="${color}" stroke-width="0.5" ${dash}/>`);
        break;
      }
      case 'circle': {
        const c = entities[e.centerId] as any;
        if (!c) break;
        lines.push(`<circle cx="${c.x}" cy="${-c.y}" r="${e.radius}" fill="none" stroke="${color}" stroke-width="0.5" ${dash}/>`);
        break;
      }
      case 'arc': {
        const c = entities[e.centerId] as any;
        if (!c) break;
        const x1 = c.x + e.radius * Math.cos(e.startAngle);
        const y1 = -(c.y + e.radius * Math.sin(e.startAngle));
        const x2 = c.x + e.radius * Math.cos(e.endAngle);
        const y2 = -(c.y + e.radius * Math.sin(e.endAngle));
        let sweepDeg = (e.endAngle - e.startAngle) * 180 / Math.PI;
        if (sweepDeg <= 0) sweepDeg += 360;
        const largeArc = sweepDeg > 180 ? 1 : 0;
        lines.push(`<path d="M ${x1} ${y1} A ${e.radius} ${e.radius} 0 ${largeArc} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="0.5" ${dash}/>`);
        break;
      }
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}mm" height="${vbH}mm">
  <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#1e1e1e"/>
  ${lines.join('\n  ')}
</svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sketch.svg'; a.click();
  URL.revokeObjectURL(url);
}

const layoutStyles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: '#1e1e1e',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    height: '32px',
    background: '#323233',
    borderBottom: '1px solid #3a3a3a',
    padding: '0 12px',
    flexShrink: 0,
  },
  logo: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#e0e0e0',
    letterSpacing: '0.5px',
    flexShrink: 0,
  },
  hint: {
    fontSize: '10px',
    color: '#555',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  canvasArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  rightPanel: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
};
