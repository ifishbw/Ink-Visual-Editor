/**
 * Interned-string selectors for play decorations. Returning the identical string object across
 * calls is what makes "two or three cards re-render per step" true — zustand compares with ===.
 */
import type { PaintLevel } from './playMap';

export interface PlayFxInput {
  status: string;
  atNodeId: string | null;
  atRow: number | null;
  paint: PaintLevel;
  staleSegs: string[];
  trail: Record<string, number>;
  covLines: Record<string, number[]>;
  covHits: Record<string, number>;
  covTotal: Record<string, number>;
  visits: Record<string, number>;
  breakpoints: Record<string, number[]>;
  /** Other preview-row indices (not the playhead) that this Continue() touched, by segId. */
  stepRows: Record<string, number[]>;
  dim: boolean;
}

const intern = new Map<string, string>();
function interned(s: string): string {
  const hit = intern.get(s);
  if (hit !== undefined) return hit;
  intern.set(s, s);
  return s;
}

export const FX_EMPTY = interned('');

function idle(s: PlayFxInput): boolean {
  return s.status === 'idle' || s.status === 'compiling' || s.status === 'cantPlay';
}

/** `'' | 'now' | 'trail' | 'stale' | 'now stale' | ...` */
export function nodeFxOf(s: PlayFxInput, id: string): string {
  if (idle(s)) return FX_EMPTY;
  const bits: string[] = [];
  const here = s.atNodeId === id && (s.paint.level === 'row' || s.paint.level === 'card');
  if (here) bits.push('now');
  else if (s.trail[id] != null) bits.push('trail');
  if (s.staleSegs.includes(id)) bits.push('stale');
  return interned(bits.join(' '));
}

/** `'7:now,5:step|cov:0,1,5,7|bp:12|dim'` */
export function rowFxOf(s: PlayFxInput, id: string): string {
  if (idle(s)) return FX_EMPTY;
  const marks: string[] = [];
  if (s.paint.level === 'row' && s.atNodeId === id && s.atRow != null) marks.push(`${s.atRow}:now`);
  const steps = s.stepRows[id];
  if (steps) {
    for (const r of steps) {
      if (s.paint.level === 'row' && s.atNodeId === id && r === s.atRow) continue;
      marks.push(`${r}:step`);
    }
  }
  const cov = (s.covLines[id] ?? []).join(',');
  const bp = (s.breakpoints[id] ?? []).join(',');
  const stale = s.staleSegs.includes(id);
  const dim = s.dim && !stale ? '|dim' : '';
  // Coverage is drawn on live rows; suppress it for knots whose text changed (same reason as the row highlight).
  const covPart = stale ? '' : cov;
  const body = `${marks.join(',')}|cov:${covPart}|bp:${bp}${dim}`;
  return interned(body === '|cov:|bp:' || body === '|cov:|bp:|dim' ? (s.dim && !stale ? '|dim' : '') : body);
}

/** `'now|cov:7/9|visits:3'` */
export function headerFxOf(s: PlayFxInput, id: string): string {
  if (idle(s)) return FX_EMPTY;
  const bits: string[] = [];
  if (s.atNodeId === id && (s.paint.level === 'row' || s.paint.level === 'card')) bits.push('now');
  const total = s.covTotal[id];
  const stale = s.staleSegs.includes(id);
  if (total != null && total > 0) {
    bits.push(stale ? 'cov:—' : `cov:${s.covHits[id] ?? 0}/${total}`);
  }
  const v = s.visits[id];
  if (v != null && v > 0) bits.push(`visits:${v}`);
  return interned(bits.join('|'));
}

export function parseRowFx(fx: string): {
  now: Set<number>;
  step: Set<number>;
  cov: Set<number>;
  bp: Set<number>;
  dim: boolean;
} {
  const now = new Set<number>();
  const step = new Set<number>();
  const cov = new Set<number>();
  const bp = new Set<number>();
  let dim = false;
  if (!fx) return { now, step, cov, bp, dim };
  const parts = fx.split('|');
  const marks = parts[0] ?? '';
  if (marks) {
    for (const bit of marks.split(',')) {
      const [n, kind] = bit.split(':');
      const row = Number(n);
      if (!Number.isFinite(row)) continue;
      if (kind === 'now') now.add(row);
      else if (kind === 'step') step.add(row);
    }
  }
  for (const p of parts.slice(1)) {
    if (p === 'dim') dim = true;
    else if (p.startsWith('cov:')) {
      const rest = p.slice(4);
      if (rest) for (const n of rest.split(',')) { const v = Number(n); if (Number.isFinite(v)) cov.add(v); }
    } else if (p.startsWith('bp:')) {
      const rest = p.slice(3);
      if (rest) for (const n of rest.split(',')) { const v = Number(n); if (Number.isFinite(v)) bp.add(v); }
    }
  }
  return { now, step, cov, bp, dim };
}

export function parseHeaderFx(fx: string): { now: boolean; cov: string | null; visits: number | null } {
  let now = false;
  let cov: string | null = null;
  let visits: number | null = null;
  if (!fx) return { now, cov, visits };
  for (const bit of fx.split('|')) {
    if (bit === 'now') now = true;
    else if (bit.startsWith('cov:')) cov = bit.slice(4);
    else if (bit.startsWith('visits:')) visits = Number(bit.slice(7));
  }
  return { now, cov, visits };
}
