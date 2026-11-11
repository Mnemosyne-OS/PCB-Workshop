/**
 * types.ts — what the `kicad:run` door hands back (host `ipc/kicadHandlers.ts`,
 * `lib/kicadCli.ts`), restated on the cartridge side.
 */

export interface KicadStatus {
  found: boolean;
  /** `10.0.8`, or null when none was found or its version was unreadable. */
  version: string | null;
  supported: boolean;
  minMajor: number;
}

/** A project the person picked: its name, never its path. */
export interface Project {
  id: string;
  name: string;
  addedAt: string;
  hasBoard: boolean;
  hasSchematic: boolean;
  missing: boolean;
}

export interface Sources {
  sources: Array<{ name: string; text: string }>;
  rootSchematic: string | null;
  /** A drawing too large to send; the checks still work. */
  boardTooLarge?: boolean;
  schematicTooLarge?: boolean;
}

export type Severity = 'error' | 'warning' | 'exclusion' | 'other';

/** `type` is KiCad's stable key; `text` is KiCad's own words, in KiCad's interface language. */
export interface Finding {
  kind: 'violation' | 'unconnected' | 'parity';
  type: string;
  severity: Severity;
  text: string;
  /** The designer's comment on an excluded finding; absent from an older host. */
  comment?: string;
  items: Array<{ text: string; x: number | null; y: number | null }>;
}

export interface Report {
  kicadVersion: string | null;
  findings: Finding[];
  counts: Record<Severity, number>;
  truncated: boolean;
}

export type JobResult =
  | { job: 'drc' | 'erc'; report: Report; ms: number }
  | {
      job: 'orderPack'; fabricator: 'jlcpcb'; zipName: string; zipBytes: number; files: string[]; layers: string[];
      /** BOM lines, and how many have no JLCPCB part number. */
      bomLines: number; bomWithoutPart: number; ms: number;
    }
  | { job: 'step'; fileName: string; bytes: number; ms: number }
  | { job: 'render'; side: 'top' | 'bottom'; fileName: string; bytes: number; dataUrl: string; ms: number };

/** Doc 218 §7: the level is the person's setting, never guessed. */
export type Level = 'beginner' | 'maker' | 'pro';
export const LEVELS: readonly Level[] = ['beginner', 'maker', 'pro'];
