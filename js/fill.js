// Fill-a-column logic for the circuit table. Pure (Node-testable).
export const COMMON_VALUES = {
  wiring: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'O'], refMethod: ['A', 'B', 'C', '100', '101', '102', '103', 'D', 'E'],
  points: ['1', '2', '4', '6', '8', '10'], live: ['1.0', '1.5', '2.5', '4.0', '6.0', '10', '16'], cpc: ['1.0', '1.5', '2.5', '4.0', '6.0'],
  maxDisc: ['0.4', '5'], bsen: ['60898', '61009', '62423', '88-3', '3036'], type: ['B', 'C', 'D'], rating: ['6', '10', '16', '20', '32', '40', '45'],
  bc: ['6', '10'], rcdBsen: ['61009', '61008', '62423'], rcdType: ['AC', 'A', 'F', 'B', 'S'], idn: ['30', '100'], rcdRating: ['40', '63', '80', '100'],
  testV: ['500', '250', '1000'], irLL: ['>999', '>200', '>500', 'LIM', 'N/A'], irLE: ['>999', '>200', '>500', 'LIM', 'N/A'],
  polarity: ['✓', 'X', 'N/A', 'LIM'], rcdBtn: ['✓', 'X', 'N/A'], afddBtn: ['✓', 'X', 'N/A'],
  r1: ['N/A', 'LIM'], rn: ['N/A', 'LIM'], r2: ['N/A', 'LIM'], r1r2: ['LIM', 'N/A'], R2: ['N/A', 'LIM'], zs: ['LIM', 'N/A'], rcdTime: ['N/A', 'LIM'], rcd5x: ['N/A', 'LIM'],
  remarks: ['Spare', 'LIM – see Section D', 'Not tested – occupier request'], desc: ['Spare'],
};

export function isSpare(c) {
  return /\b(spare|unused|not in use|disconnected|redundant|blank)\b/i.test(c.desc || '') || /^\s*LIM\s*$/i.test(c.zs || '') || /\b(untested|not tested)\b/i.test(c.remarks || '');
}

/**
 * @param circuits array of circuit objects
 * @param field column key
 * @param value value to write
 * @param opts { overwrite=false, skipSpare=true, rows=null (array of indexes to limit to) }
 * @returns { changes:[{index, old, value}], fills, replaces, skipped }
 */
export function planFill(circuits, field, value, opts = {}) {
  const { overwrite = false, skipSpare = true, rows = null } = opts;
  const v = String(value ?? '').trim();
  const changes = []; let skipped = 0;
  if (!v || !field) return { changes, fills: 0, replaces: 0, skipped };
  circuits.forEach((c, index) => {
    if (rows && !rows.includes(index)) return;
    if (skipSpare && field !== 'desc' && field !== 'remarks' && isSpare(c)) { skipped++; return; }
    const old = String(c[field] ?? '').trim();
    if (old === v) return;
    if (old && !overwrite) { skipped++; return; }
    changes.push({ index, old, value: v });
  });
  return { changes, fills: changes.filter(x => !x.old).length, replaces: changes.filter(x => x.old).length, skipped };
}

/** Apply a plan; returns undo list [{index, field, old}] */
export function applyFill(circuits, field, plan) {
  return plan.changes.map(ch => { const c = circuits[ch.index]; const old = c[field]; c[field] = ch.value; if (field === 'maxZs') c.maxZsManual = true; return { index: ch.index, field, old }; });
}
