// Certificate kinds: EICR, EIC, Minor Works. Shared labels and ref suffixes.
export const KINDS = {
  eicr: { label: 'EICR', full: 'Electrical Installation Condition Report', ref: 'EICR',
    tabs: ['client', 'extent', 'supply', 'inspection', 'boards', 'observations', 'summary', 'check'] },
  eic: { label: 'EIC', full: 'Electrical Installation Certificate', ref: 'EIC',
    tabs: ['client', 'extent', 'supply', 'inspection', 'boards', 'summary', 'check'] },
  mw: { label: 'Minor Works', full: 'Minor Electrical Installation Works Certificate', ref: 'MW',
    tabs: ['client', 'supply', 'boards', 'summary', 'check'], maxCircuits: 4 },
};
export const kindOf = j => KINDS[j?.kind] ? j.kind : 'eicr';
export const kindMeta = j => KINDS[kindOf(j)];
