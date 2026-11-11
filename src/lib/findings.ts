/**
 * findings.ts — KiCad's DRC and ERC findings, sorted and explained.
 *
 * KiCad writes each finding's `description` in its own interface language
 * (French on a French machine, doc 218 §4.1), so the workshop keys everything
 * on `type` and writes its own sentence through `t()`. A type without a
 * sentence gets the generic one, never a guess.
 */
import type { Finding, Report, Severity } from './types';

/**
 * The finding types that have a plain-language explanation in the locales
 * (`explain.<type>`). The keys are KiCad's own, read from `drc.v1.json` and
 * `erc.v1.json` reports.
 */
export const EXPLAINED_TYPES = [
  // DRC
  'clearance', 'unconnected_items', 'track_width', 'hole_clearance', 'copper_edge_clearance',
  'courtyards_overlap', 'silk_overlap', 'silk_over_copper', 'solder_mask_bridge', 'annular_width',
  'drill_out_of_range', 'hole_to_hole', 'invalid_outline', 'isolated_copper', 'starved_thermal',
  'track_dangling', 'via_dangling', 'lib_footprint_issues', 'lib_footprint_mismatch',
  'missing_footprint', 'extra_footprint', 'duplicate_footprints', 'net_conflict', 'shorting_items',
  // ERC
  'pin_not_connected', 'pin_not_driven', 'power_pin_not_driven', 'label_dangling', 'wire_dangling',
  'pin_to_pin', 'unannotated', 'duplicate_reference', 'lib_symbol_issues', 'multiple_net_names',
  'global_label_dangling', 'endpoint_off_grid', 'footprint_link_issues',
  // The four most frequent types the first list missed on the KiCad demos (cold review).
  'text_thickness', 'text_height', 'silk_edge_clearance', 'holes_co_located',
] as const;

const EXPLAINED = new Set<string>(EXPLAINED_TYPES);

/** The locale key that explains a finding type. */
export function explainKey(type: string): string {
  return EXPLAINED.has(type) ? `explain.${type}` : 'explain._other';
}

/** Findings of one type, grouped: a board with 40 clearance errors shows one line with ×40. */
export interface FindingGroup {
  type: string;
  severity: Severity;
  kind: Finding['kind'];
  count: number;
  /** KiCad's own words for the first finding of the group (pro level). */
  sample: string;
  /** The designer's comment on the first excluded finding of the group, if any. */
  comment: string;
  /** Where the first findings are, in mm; null coordinates stay out. */
  places: Array<{ x: number; y: number; text: string }>;
}

const RANK: Record<Severity, number> = { error: 0, warning: 1, other: 2, exclusion: 3 };

export function groupFindings(findings: readonly Finding[]): FindingGroup[] {
  const by = new Map<string, FindingGroup>();
  for (const f of findings) {
    const key = `${f.severity}|${f.type}`;
    let g = by.get(key);
    if (!g) {
      g = { type: f.type, severity: f.severity, kind: f.kind, count: 0, sample: f.text, comment: f.comment ?? '', places: [] };
      by.set(key, g);
    }
    g.count++;
    for (const it of f.items) {
      if (g.places.length >= 6) break;
      if (it.x !== null && it.y !== null) g.places.push({ x: it.x, y: it.y, text: it.text });
    }
  }
  return [...by.values()].sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.count - a.count || a.type.localeCompare(b.type));
}

/**
 * Ready to order: no error left in the checks the project HAS. A board
 * without a schematic is judged on its DRC alone, and the reverse: waiting for
 * both left such a project « Not checked » forever (cold review, finding 9).
 * Excluded findings never count; warnings are the person's call.
 */
export function verdictOf(
  drc: Report | null,
  erc: Report | null,
  needs: { board: boolean; schematic: boolean } = { board: true, schematic: true },
): 'unknown' | 'blocked' | 'warnings' | 'clean' {
  if (!needs.board && !needs.schematic) return 'unknown';
  if ((needs.board && !drc) || (needs.schematic && !erc)) return 'unknown';
  const reports = [needs.board ? drc : null, needs.schematic ? erc : null].filter((r): r is Report => r !== null);
  if (reports.some((r) => r.counts.error > 0)) return 'blocked';
  if (reports.some((r) => r.counts.warning > 0)) return 'warnings';
  return 'clean';
}

/** `1,5 ko` style sizes, units and all in the person's locale (Intl unit names). */
export function formatBytes(bytes: number, locale: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: units[u], unitDisplay: 'short', maximumFractionDigits: u === 0 ? 0 : 1 }).format(v);
}

export function formatSeconds(ms: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000)} s`;
}
