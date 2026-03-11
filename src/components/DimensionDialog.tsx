import { useEffect, useRef, useState } from 'react';
import { useSketchStore } from '../state/sketchStore';
import { solve, solveSimple } from '../solver/ConstraintSolver';
import { toDisplay, fromDisplay, UNIT_LABELS } from '../geometry/units';

export function DimensionDialog() {
  const dialog = useSketchStore(s => s.dimensionDialog);
  const closeDimensionDialog = useSketchStore(s => s.closeDimensionDialog);
  const updateDimensionConstraintValue = useSketchStore(s => s.updateDimensionConstraintValue);
  const toggleConstraintDriving = useSketchStore(s => s.toggleConstraintDriving);
  const removeConstraint = useSketchStore(s => s.removeConstraint);
  const pushHistory = useSketchStore(s => s.pushHistory);
  const units = useSketchStore(s => s.units);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState('');
  const [isReference, setIsReference] = useState(false);

  useEffect(() => {
    if (dialog.open) {
      const constraint = useSketchStore.getState().constraints[dialog.constraintId ?? ''];
      // Convert stored mm value to display units for the input
      const mmVal = dialog.value ? parseFloat(dialog.value) : undefined;
      if (mmVal !== undefined && !isNaN(mmVal) && constraint?.type !== 'angle') {
        setLocalValue(toDisplay(mmVal, units).toFixed(units === 'm' || units === 'ft' ? 4 : 3));
      } else {
        setLocalValue(dialog.value || '');
      }
      setIsReference(constraint ? !constraint.driving : false);
      setTimeout(() => inputRef.current?.select(), 30);
    }
  }, [dialog.open, dialog.value, dialog.constraintId, units]);

  if (!dialog.open || !dialog.constraintId) return null;

  const constraint = useSketchStore.getState().constraints[dialog.constraintId];
  if (!constraint) return null;

  const isAngle = constraint.type === 'angle';
  const displayUnits = isAngle ? '°' : UNIT_LABELS[units];

  const handleConfirm = () => {
    const num = parseFloat(localValue);
    if (isNaN(num) || num <= 0) {
      alert('Enter a valid positive number.');
      return;
    }
    // Convert from display units back to mm (angles stay as degrees)
    const storedValue = isAngle ? num : fromDisplay(num, units);
    pushHistory();
    updateDimensionConstraintValue(dialog.constraintId!, storedValue);
    // Set driving state if changed
    if (isReference === constraint.driving) {
      toggleConstraintDriving(dialog.constraintId!);
    }
    closeDimensionDialog();
    try { solve(); } catch { solveSimple(); }
  };

  const handleCancel = () => {
    if (constraint.value === undefined) {
      removeConstraint(dialog.constraintId!);
    }
    closeDimensionDialog();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') handleCancel();
  };

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
            step="0.001"
            min="0.001"
            value={localValue}
            onChange={e => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            style={styles.input}
            placeholder="Enter value"
          />
          <span style={styles.units}>{displayUnits}</span>
        </div>
        <label style={styles.referenceRow}>
          <input
            type="checkbox"
            checked={isReference}
            onChange={e => setIsReference(e.target.checked)}
            style={{ marginRight: '6px' }}
          />
          <span style={styles.referenceLabel}>Reference (driven)</span>
        </label>
        <div style={styles.refHint}>
          {isReference
            ? 'Shows measurement only — does not constrain geometry'
            : 'Drives geometry to match the entered value'}
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
    gap: '10px',
    minWidth: '240px',
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
    minWidth: '28px',
  },
  referenceRow: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  referenceLabel: {
    fontSize: '12px',
    color: '#ccc',
  },
  refHint: {
    fontSize: '10px',
    color: '#666',
    marginTop: '-4px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    marginTop: '2px',
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
