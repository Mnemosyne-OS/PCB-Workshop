/**
 * sheet.ts — the board sheet kept in the workshop's own vault (doc 218 §8).
 *
 * One sheet per keep: the board's name, the date, the KiCad version, what the
 * checks found by type, and the order pack if one was made. At the next
 * project the chat can find "last time, this board had 12 clearance errors".
 * The sheet is written in English on purpose: it is read by the memory
 * engine and the chat, not shown as an interface string.
 */
import { groupFindings } from './findings';
import type { Report } from './types';

/** The spine a board sheet is filed under. */
export const SHEET_SPINE = 'PCB_BOARD';

export interface SheetInput {
  board: string;
  at: Date;
  kicadVersion: string | null;
  drc: Report | null;
  erc: Report | null;
  orderPack: { fabricator: string; zipName: string; files: number } | null;
  /** What the person typed about this board, if anything. */
  note: string;
}

/** The person's own calendar day: at 22:00 in Montreal, UTC is already tomorrow. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function checkLines(label: string, r: Report | null): string[] {
  if (!r) return [`${label}: not run.`];
  const head = `${label}: ${r.counts.error} error(s), ${r.counts.warning} warning(s)${r.truncated ? ' (report cut)' : ''}.`;
  const groups = groupFindings(r.findings).filter((g) => g.severity === 'error' || g.severity === 'warning');
  return [head, ...groups.slice(0, 12).map((g) => `- ${g.severity} ${g.type} ×${g.count}`)];
}

export function boardSheet(s: SheetInput): string {
  const lines = [
    `PCB board sheet: ${s.board}`,
    `Date: ${localDay(s.at)}`,
    `KiCad: ${s.kicadVersion ?? 'unknown'}`,
    ...checkLines('Design rules check (DRC)', s.drc),
    ...checkLines('Electrical rules check (ERC)', s.erc),
    s.orderPack
      ? `Order pack: ${s.orderPack.fabricator}, ${s.orderPack.zipName}, ${s.orderPack.files} file(s).`
      : 'Order pack: not made.',
  ];
  const note = s.note.trim();
  if (note) lines.push(`Note: ${note.slice(0, 2000)}`);
  return lines.join('\n');
}
