import { useEffect, useRef, useState } from 'react';
import { useSketchStore } from '../state/sketchStore';
import { solve, solveSimple } from '../solver/ConstraintSolver';

export function DimensionDialog() {
  const dialog = useSketchStore(s => s.dimensionDialog);
  const closeDimensionDialog = useSketchStore(s => s.closeDimensionDialog);
  const updateDimensionConstraintValue = useSketchStore(s => s.updateDimensionConstraintValue);
  const removeConstraint = useSketchStore(s => s.removeConstraint);
  const pushHistory = useSketchStore(s => s.pushHistory);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState('');

  useEffect(() => {
    if (dialog.open) {
      setLocalValue(dialog.value || '');
      setTimeout(() => inputRef.current?.select(), 30);
    }
  }, [dialog.open, dialog.value]);

  if (!dialog.open || !dialog.constraintId) return null;

  const constraint = useSketchStore.getState().constraints[dialog.constraintId];
  if (!constraint) return null;

  const handleConfirm = () => {
    const num = parseFloat(localValue);
    if (isNaN(num) || num <= 0) {
      alert('Enter a valid positive number.');
      return;
    }
    pushHistory();
    updateDimensionConstraintValue(dialog.constraintId!, num);
    closeDimensionDialog();
    try { solve(); } catch { solveSimple(); }
  };

  const handleCancel = () => {
    // If the constraint was just created without a value, remove it
    if (constraint.value === undefined) {
      removeConstraint(dialog.constraintId!);
    }
    closeDimensionDialog();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') handleCancel();
  };

  const units = constraint.type === 'angle' ? '°' : 'mm';
  const label =
    constraint.type === 'distance' ? 'Distance' :
    constraint.type === 'horizontalDistance' ? 'Horizontal Distance' :
    constraint.type === 'verticalDistance' ? 'Vertical Distance' :
    constraint.type === 'angle' ? 'Angle' :
    constraint.type === 'radius' ? 'Radius' :
    constraint.type === 'diameter' ? 'Diameter' :
    'Value';

  return (
    <div style={styles.overlay}>
      <div style={styles.dialog}>
        <div style={styles.title}>{label}</div>
        <div style={styles.row}>
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            min="0.001"
            value={localValue}
            onChange={e => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            style={styles.input}
            placeholder="Enter value"
          />
          <span style={styles.units}>{units}</span>
        </div>
        <div style={styles.actions}>
          <button onClick={handleCancel} style={styles.btnCancel}>Cancel</button>
          <button onClick={handleConfirm} style={styles.btnOk}>OK</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.5)',
    zIndex: 1000,
  },
  dialog: {
    background: '#252526',
    border: '1px solid #555',
    borderRadius: '6px',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minWidth: '220px',
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#e0e0e0',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  input: {
    flex: 1,
    background: '#1e1e1e',
    border: '1px solid #555',
    borderRadius: '4px',
    color: '#e0e0e0',
    fontSize: '13px',
    padding: '6px 8px',
    outline: 'none',
  },
  units: {
    fontSize: '11px',
    color: '#888',
    minWidth: '20px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  btnCancel: {
    background: '#3a3a3a',
    border: '1px solid #555',
    borderRadius: '4px',
    color: '#ccc',
    padding: '5px 12px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  btnOk: {
    background: '#0e639c',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    padding: '5px 16px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
  },
};
