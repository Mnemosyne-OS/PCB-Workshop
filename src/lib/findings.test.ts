/**
 * Findings grouped and explained, the board sheet, and the locales: every
 * explained type and every key used on screen exists in en, fr and es.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPLAINED_TYPES, explainKey, formatBytes, groupFindings, verdictOf } from './findings';
import { boardSheet } from './sheet';
import type { Finding, Report } from './types';
import en from '../i18n/locales/en.json';
import fr from '../i18n/locales/fr.json';
import es from '../i18n/locales/es.json';
import { keysOf } from '../i18n/useI18n';

const f = (type: string, severity: Finding['severity'], items: Finding['items'] = []): Finding =>
  ({ kind: 'violation', type, severity, text: `kicad ${type}`, items });
const rep = (findings: Finding[]): Report => {
  const counts = { error: 0, warning: 0, exclusion: 0, other: 0 };
  for (const x of findings) counts[x.severity]++;
  return { kicadVersion: '10.0.8', findings, counts, truncated: false };
};

describe('grouping', () => {
  it('groups by type and severity, errors first, then by count', () => {
    const g = groupFindings([f('silk_overlap', 'warning'), f('clearance', 'error'), f('silk_overlap', 'warning'), f('track_width', 'error'), f('clearance', 'error')]);
    expect(g.map((x) => `${x.severity}:${x.type}:${x.count}`)).toEqual(['error:clearance:2', 'error:track_width:1', 'warning:silk_overlap:2']);
  });

  it('keeps only places with both coordinates, at most six', () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ text: `P${i}`, x: i === 0 ? null : i, y: i }));
    const g = groupFindings([f('clearance', 'error', items)]);
    expect(g[0]?.places).toHaveLength(6);
    expect(g[0]?.places[0]?.text).toBe('P1');
  });
});

describe('verdict', () => {
  it('is unknown until both checks ran, blocked on any error, then warnings, then clean', () => {
    expect(verdictOf(rep([]), null)).toBe('unknown');
    expect(verdictOf(rep([]), rep([f('pin_not_connected', 'error')]))).toBe('blocked');
    expect(verdictOf(rep([f('silk_overlap', 'warning')]), rep([]))).toBe('warnings');
    expect(verdictOf(rep([f('x', 'exclusion')]), rep([]))).toBe('clean');
  });
});

describe('explanations', () => {
  it('has a sentence for every explained type in every language, and a generic one', () => {
    for (const bundle of [en, fr, es] as Array<{ explain: Record<string, string> }>) {
      for (const type of EXPLAINED_TYPES) expect(bundle.explain[type], type).toBeTruthy();
      expect(bundle.explain._other).toBeTruthy();
    }
    expect(explainKey('clearance')).toBe('explain.clearance');
    expect(explainKey('brand_new_check')).toBe('explain._other');
  });

  it('has the same keys in en, fr and es', () => {
    const k = keysOf(en).sort();
    expect(keysOf(fr).sort()).toEqual(k);
    expect(keysOf(es).sort()).toEqual(k);
  });

  it('has a sentence for every refusal code the kicad door and the cartridge send', () => {
    // From host ipc/kicadHandlers.ts and lib/kicadCli.ts, plus the cartridge's own.
    const codes = [
      'NO_HOST', 'KICAD_NOT_FOUND', 'KICAD_TOO_OLD', 'KICAD_TIMEOUT', 'KICAD_FILE_UNREADABLE', 'KICAD_FAILED',
      'KICAD_OUTPUT_TOO_LARGE', 'BUSY', 'UNKNOWN_PROJECT', 'PROJECT_GONE', 'NO_BOARD', 'NO_SCHEMATIC',
      'SOURCES_TOO_LARGE', 'NOT_A_KICAD_FILE', 'TOO_MANY_PROJECTS', 'STORE_UNREADABLE', 'REPORT_UNREADABLE',
      'POSITIONS_UNREADABLE', 'NOTHING_PLOTTED', 'NOTHING_WRITTEN', 'NOTHING_TO_SHOW', 'PERMISSION_DENIED',
      'FILE_LOCKED', 'FILE_MISSING', 'DISK_FULL', 'INTERNAL_ERROR', 'UNKNOWN_FABRICATOR', 'UNKNOWN_SIDE', 'BOM_UNREADABLE',
      'STORE_WRITE_FAILED', 'NO_PROJECT',
    ];
    for (const bundle of [en, fr, es] as Array<{ error: Record<string, string> }>) {
      expect(codes.filter((c) => !bundle.error[c])).toEqual([]);
    }
  });

  it('keeps the same {{placeholders}} in every language', () => {
    const flat = (b: Record<string, unknown>, p = ''): Array<[string, string]> => Object.entries(b).flatMap(([k, v]) =>
      v && typeof v === 'object' ? flat(v as Record<string, unknown>, `${p}${k}.`) : [[`${p}${k}`, String(v)] as [string, string]]);
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',');
    const ref = new Map(flat(en));
    for (const bundle of [fr, es]) {
      for (const [k, v] of flat(bundle)) expect(vars(v), k).toBe(vars(ref.get(k) ?? ''));
    }
  });

  it('every t() key written in the code exists in English', () => {
    const src = join(__dirname, '..');
    const files = ['App.tsx', ...readdirSync(join(src, 'components')).map((n) => join('components', n))];
    const keys = new Set(keysOf(en));
    const missing: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(src, file), 'utf8');
      for (const m of text.matchAll(/\bt\('([a-zA-Z_.]+)'/g)) if (!keys.has(m[1] as string)) missing.push(`${file}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('the board sheet', () => {
  it('says what each check found, the pack, and the note', () => {
    const s = boardSheet({
      board: 'StickHub', at: new Date(2026, 10, 10, 23, 30), kicadVersion: '10.0.8',
      drc: rep([f('clearance', 'error'), f('clearance', 'error')]), erc: null,
      orderPack: { fabricator: 'jlcpcb', zipName: 'StickHub-gerber-jlcpcb.zip', files: 14 }, note: ' regulator ran hot ',
    });
    expect(s).toContain('PCB board sheet: StickHub');
    expect(s).toContain('Date: 2026-11-10');
    expect(s).toContain('- error clearance ×2');
    expect(s).toContain('Electrical rules check (ERC): not run.');
    expect(s).toContain('Order pack: jlcpcb, StickHub-gerber-jlcpcb.zip, 14 file(s).');
    expect(s).toContain('Note: regulator ran hot');
  });
});

describe('sizes', () => {
  it('formats bytes in the person\'s locale', () => {
    expect(formatBytes(512, 'en')).toBe('512 byte');
    expect(formatBytes(1536, 'fr').replace(/\s/g, ' ')).toBe('1,5 ko');
    expect(formatBytes(1536, 'en')).toBe('1.5 kB');
  });
});
