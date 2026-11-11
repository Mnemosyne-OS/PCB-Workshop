/**
 * What an agent may do in the PCB workshop (doc 149, doc 218 §6), as plain
 * functions over the app's own state and its own moves. Declared in
 * `mnemo-plugin.json` › agentActions, served by `PcbAgentActions` while the
 * window is open.
 *
 * Every move is the person's own control: a project tile, a view tab, the
 * « Check », « Order pack » and « Render » buttons, « Keep in memory ».
 * Long jobs (DRC took 77 s on the largest KiCad demo) answer `started`; the
 * agent follows them with `status`.
 *
 * ⛔ Not exposed: adding a project (opens a file dialog on the person's
 * screen), forgetting one (removes their choice), showing a file in the OS
 * file browser.
 *
 * Refusals throw `CODE: reason`; a name that fits several projects is refused
 * with their names, never resolved on the first.
 */
import { explainKey, groupFindings, verdictOf } from './findings';
import type { Project, Report } from './types';

export type AgentHandlers = Record<string, (args: Record<string, unknown>) => unknown>;

export const VIEWS = ['board', 'schematic', 'check', 'order', 'render'] as const;
export type View = (typeof VIEWS)[number];

export type Busy = null | 'check' | 'orderPack' | 'render' | 'sources' | 'step';

/** The app's state and its own moves, read fresh at every call. */
export interface PcbAgentContext {
  kicad: { found: boolean; version: string | null; supported: boolean } | null;
  /** What the open project has: a board for the DRC, a schematic for the ERC. */
  needs: { board: boolean; schematic: boolean };
  projects: readonly Project[] | null;
  current: Project | null;
  view: View;
  busy: Busy;
  lastError: string | null;
  drc: Report | null;
  erc: Report | null;
  orderPack: { zipName: string; files: number } | null;
  render: { side: 'top' | 'bottom' } | null;
  t: (key: string, vars?: Record<string, string | number>) => string;
  openProject: (id: string) => void;
  setView: (view: View) => void;
  /** Each job names its project: the screen may switch to it in the same call. */
  check: (projectId: string) => Promise<void>;
  makeOrderPack: (projectId: string) => Promise<void>;
  renderBoard: (projectId: string, side: 'top' | 'bottom') => Promise<void>;
  keepSheet: (note: string) => Promise<{ vault: string; unlocked: boolean }>;
}

/** Lowercase, accents off, punctuation as spaces: how a spoken name is compared. */
export function words(s: string): string {
  // Letters of every script count: `плата` used to fold to nothing (finding 15).
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** The project a person names: exact name first, then every word contained. */
export function findProject(list: readonly Project[], said: string): Project {
  const w = words(said);
  if (!w) throw new Error('MISSING: say which project');
  const exact = list.filter((p) => words(p.name) === w);
  if (exact.length === 1) return exact[0] as Project;
  const parts = w.split(' ');
  const hits = list.filter((p) => { const n = words(p.name); return parts.every((x) => n.includes(x)); });
  if (hits.length === 1) return hits[0] as Project;
  if (!hits.length) throw new Error(`NOT_FOUND: no project named « ${said} »; projects: ${list.map((p) => p.name).join(', ') || 'none'}`);
  throw new Error(`AMBIGUOUS: several projects match « ${said} »: ${hits.map((p) => p.name).join(', ')}`);
}

function summary(r: Report | null, t: PcbAgentContext['t']) {
  if (!r) return null;
  return {
    errors: r.counts.error,
    warnings: r.counts.warning,
    ...(r.truncated ? { cut: true } : {}),
    top: groupFindings(r.findings)
      .filter((g) => g.severity === 'error' || g.severity === 'warning')
      .slice(0, 8)
      .map((g) => ({ type: g.type, severity: g.severity, count: g.count, explanation: t(explainKey(g.type)) })),
  };
}

export function pcbAgentHandlers(get: () => PcbAgentContext): AgentHandlers {
  /** The project an action targets: the named one (opened on screen), else the open one. */
  const target = (args: Record<string, unknown>, needs?: 'board' | 'schematic'): { ctx: PcbAgentContext; projectId: string } => {
    const ctx = get();
    if (!ctx.kicad?.found) throw new Error('KICAD_NOT_FOUND: KiCad is not installed on this computer');
    if (!ctx.kicad.supported) throw new Error(`KICAD_TOO_OLD: KiCad ${ctx.kicad.version ?? '?'} is older than the workshop needs`);
    if (ctx.busy) throw new Error(`BUSY: ${ctx.busy} is running; call status until busy is null`);
    const said = typeof args.project === 'string' ? args.project : '';
    const p = said ? findProject(ctx.projects ?? [], said) : ctx.current;
    if (!p) throw new Error('NO_PROJECT: no project is open; name one (projects lists them)');
    // Refused now, as the screen greys the button: answering `started` and
    // failing later in status was a sister door that disagreed (finding, portes).
    if (needs === 'board' && !p.hasBoard) throw new Error(`NO_BOARD: ${p.name} has no .kicad_pcb`);
    if (needs === 'schematic' && !p.hasSchematic) throw new Error(`NO_SCHEMATIC: ${p.name} has no .kicad_sch`);
    if (ctx.current?.id !== p.id) ctx.openProject(p.id);
    return { ctx, projectId: p.id };
  };

  /** Starts a long job without waiting on it: its outcome is read with status. */
  const start = (job: () => Promise<void>, name: string) => {
    job().catch((err: unknown) => console.warn(`[PCB] agent ${name} failed:`, err instanceof Error ? err.message : err));
    return { started: true, follow: 'status' };
  };

  // agent-actions:begin
  return {
    status: () => {
      const ctx = get();
      return {
        kicad: ctx.kicad ? { found: ctx.kicad.found, version: ctx.kicad.version, supported: ctx.kicad.supported } : null,
        projects: ctx.projects?.length ?? null,
        project: ctx.current?.name ?? null,
        view: ctx.view,
        busy: ctx.busy,
        ...(ctx.lastError ? { lastError: ctx.lastError } : {}),
        verdict: verdictOf(ctx.drc, ctx.erc, ctx.needs),
        drc: summary(ctx.drc, ctx.t),
        erc: summary(ctx.erc, ctx.t),
        orderPack: ctx.orderPack,
        render: ctx.render,
      };
    },
    projects: () => {
      const ctx = get();
      if (!ctx.projects) throw new Error('BUSY: the project list is being read; call again');
      return ctx.projects.map((p) => ({
        name: p.name,
        ...(p.hasBoard ? {} : { noBoard: true }),
        ...(p.hasSchematic ? {} : { noSchematic: true }),
        ...(p.missing ? { missing: true } : {}),
        ...(ctx.current?.id === p.id ? { open: true } : {}),
      }));
    },
    openProject: (args) => {
      const ctx = get();
      const said = typeof args.project === 'string' ? args.project : '';
      const p = findProject(ctx.projects ?? [], said);
      ctx.openProject(p.id);
      return { opened: p.name };
    },
    showView: (args) => {
      const ctx = get();
      const view = args.view;
      if (!(VIEWS as readonly unknown[]).includes(view)) throw new Error(`INVALID: view is one of ${VIEWS.join(', ')}`);
      if (!ctx.current) throw new Error('NO_PROJECT: no project is open');
      ctx.setView(view as View);
      return { view };
    },
    check: (args) => {
      const { ctx, projectId } = target(args);
      return start(() => ctx.check(projectId), 'check');
    },
    orderPack: (args) => {
      const { ctx, projectId } = target(args, 'schematic');
      if (!ctx.projects?.find((x) => x.id === projectId)?.hasBoard) throw new Error('NO_BOARD: the order pack needs the board');
      return start(() => ctx.makeOrderPack(projectId), 'orderPack');
    },
    render: (args) => {
      if (args.side !== undefined && args.side !== 'top' && args.side !== 'bottom') throw new Error('INVALID: side is top or bottom');
      const { ctx, projectId } = target(args, 'board');
      const side = args.side === 'bottom' ? 'bottom' : 'top';
      return start(() => ctx.renderBoard(projectId, side), 'render');
    },
    explain: (args) => {
      const ctx = get();
      const type = typeof args.type === 'string' ? args.type.trim() : '';
      if (!type) throw new Error('MISSING: type is the finding key, e.g. clearance');
      return { type, explanation: ctx.t(explainKey(type)), known: explainKey(type) !== 'explain._other' };
    },
    keepSheet: async (args) => {
      const ctx = get();
      if (!ctx.current) throw new Error('NO_PROJECT: no project is open');
      if (!ctx.drc && !ctx.erc && !ctx.orderPack) throw new Error('NOTHING_TO_KEEP: run check or orderPack first');
      const note = typeof args.note === 'string' ? args.note.slice(0, 2000) : '';
      const kept = await ctx.keepSheet(note);
      return { kept: ctx.current.name, vault: kept.vault };
    },
  };
  // agent-actions:end
}
