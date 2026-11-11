/**
 * The workshop's agent actions (doc 149): the manifest passes the HOST's own
 * check, every declared action has its handler, and every handler refuses
 * what the doc says it refuses.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentActionsFromManifest } from '../../../infinity-edition/src/main/plugins/cartridgeAgentActions';
import { findProject, pcbAgentHandlers, VIEWS, type PcbAgentContext } from './pcbAgent';
import type { Project, Report } from './types';

const root = join(__dirname, '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'mnemo-plugin.json'), 'utf8')) as unknown;
const source = readFileSync(join(root, 'src', 'lib', 'pcbAgent.ts'), 'utf8');
const block = source.slice(source.indexOf('// agent-actions:begin'), source.indexOf('// agent-actions:end'));
const handlerIds = [...block.matchAll(/^ {4}(\w+): (?:async )?\(/gm)].map((m) => m[1]);

function declared() {
  const r = agentActionsFromManifest(manifest);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const project = (name: string, id = name): Project => ({ id, name, addedAt: '', hasBoard: true, hasSchematic: true, missing: false });
const report = (errors: number, warnings: number): Report => ({
  kicadVersion: '10.0.8', truncated: false,
  counts: { error: errors, warning: warnings, exclusion: 0, other: 0 },
  findings: [
    ...Array.from({ length: errors }, () => ({ kind: 'violation' as const, type: 'clearance', severity: 'error' as const, text: 'Isolation', items: [] })),
    ...Array.from({ length: warnings }, () => ({ kind: 'violation' as const, type: 'silk_overlap', severity: 'warning' as const, text: '', items: [] })),
  ],
});

function ctx(over: Partial<PcbAgentContext> = {}): PcbAgentContext {
  return {
    kicad: { found: true, version: '10.0.8', supported: true },
    needs: { board: true, schematic: true },
    projects: [project('StickHub', 'a'), project('Carte LED', 'b'), project('Carte LED v2', 'c')],
    current: null, view: 'board', busy: null, lastError: null,
    drc: null, erc: null, orderPack: null, render: null,
    t: (k) => `t:${k}`,
    openProject: vi.fn(), setView: vi.fn(),
    check: vi.fn(async () => {}), makeOrderPack: vi.fn(async () => {}), renderBoard: vi.fn(async () => {}),
    keepSheet: vi.fn(() => Promise.resolve({ vault: 'APP-pcb', unlocked: false })),
    ...over,
  };
}

describe('the manifest', () => {
  it("passes the host's check", () => {
    const r = agentActionsFromManifest(manifest);
    expect(r.ok ? 'ok' : r.error).toBe('ok');
  });

  it('declares exactly the handlers the code serves', () => {
    expect(handlerIds.length).toBeGreaterThan(5);
    expect([...handlerIds].sort()).toEqual(declared().map((a) => a.id).sort());
    expect(Object.keys(pcbAgentHandlers(() => ctx())).sort()).toEqual([...handlerIds].sort());
  });

  it('spends nothing, and only status, projects and explain are reads', () => {
    expect(declared().filter((a) => a.effect === 'spend')).toEqual([]);
    expect(declared().filter((a) => a.effect === 'read').map((a) => a.id).sort()).toEqual(['explain', 'projects', 'status']);
  });

  it("offers the views the screen has", () => {
    const v = declared().find((a) => a.id === 'showView')!.params.view;
    expect(v?.type === 'string' ? v.enum : null).toEqual([...VIEWS]);
  });

  it('asks only the two permissions the doc grants', () => {
    expect((manifest as { permissions: string[] }).permissions.sort()).toEqual(['kicad:run', 'vault:write']);
  });
});

describe('finding a project by its spoken name', () => {
  const list = [project('StickHub', 'a'), project('Carte LED', 'b'), project('Carte LED v2', 'c')];
  it('takes an exact name before a partial one', () => {
    expect(findProject(list, 'carte led').id).toBe('b');
    expect(findProject(list, 'stick').id).toBe('a');
  });
  it('refuses several matches with their names, and an unknown name with the list', () => {
    expect(() => findProject(list, 'carte')).toThrow(/^AMBIGUOUS:.*Carte LED, Carte LED v2/);
    expect(() => findProject(list, 'robot')).toThrow(/^NOT_FOUND:.*StickHub/);
  });
});

describe('the handlers', () => {
  it('check refuses without KiCad, while busy, and without a project', () => {
    expect(() => pcbAgentHandlers(() => ctx({ kicad: { found: false, version: null, supported: false } })).check({})).toThrow(/^KICAD_NOT_FOUND/);
    expect(() => pcbAgentHandlers(() => ctx({ kicad: { found: true, version: '8.0.1', supported: false } })).check({})).toThrow(/^KICAD_TOO_OLD/);
    expect(() => pcbAgentHandlers(() => ctx({ busy: 'render', current: project('StickHub', 'a') })).check({})).toThrow(/^BUSY/);
    expect(() => pcbAgentHandlers(() => ctx()).check({})).toThrow(/^NO_PROJECT/);
  });

  it('check on a named project opens it and runs on THAT project, not the one open before', () => {
    const c = ctx({ current: project('StickHub', 'a') });
    const r = pcbAgentHandlers(() => c).check({ project: 'carte led' });
    expect(r).toEqual({ started: true, follow: 'status' });
    expect(c.openProject).toHaveBeenCalledWith('b');
    expect(c.check).toHaveBeenCalledWith('b');
  });

  it('render takes the side from its enum only, and refuses any other', () => {
    const c = ctx({ current: project('StickHub', 'a') });
    pcbAgentHandlers(() => c).render({ side: 'bottom' });
    pcbAgentHandlers(() => c).render({});
    expect(() => pcbAgentHandlers(() => c).render({ side: '--save-board' })).toThrow(/^INVALID/);
    expect(c.renderBoard).toHaveBeenNthCalledWith(1, 'a', 'bottom');
    expect(c.renderBoard).toHaveBeenNthCalledWith(2, 'a', 'top');
    expect(c.renderBoard).toHaveBeenCalledTimes(2);
  });

  it('refuses at once a job the project cannot do, as the screen greys its button', () => {
    const boardOnly = { ...project('Microwave', 'm'), hasSchematic: false };
    const schOnly = { ...project('Ampli', 's'), hasBoard: false };
    const c = ctx({ projects: [boardOnly, schOnly] });
    expect(() => pcbAgentHandlers(() => c).orderPack({ project: 'microwave' })).toThrow(/^NO_SCHEMATIC/);
    expect(() => pcbAgentHandlers(() => c).render({ project: 'ampli' })).toThrow(/^NO_BOARD/);
    expect(c.makeOrderPack).not.toHaveBeenCalled();
    expect(c.renderBoard).not.toHaveBeenCalled();
  });

  it('finds a project named in another script', () => {
    expect(findProject([project('Плата питания', 'r')], 'плата').id).toBe('r');
  });

  it('status reports the verdict and the main finding types with their explanation', () => {
    const s = pcbAgentHandlers(() => ctx({ drc: report(2, 1), erc: report(0, 0) })).status({}) as Record<string, unknown>;
    expect(s.verdict).toBe('blocked');
    expect((s.drc as { top: unknown[] }).top[0]).toEqual({ type: 'clearance', severity: 'error', count: 2, explanation: 't:explain.clearance' });
  });

  it('explain falls back to the generic sentence for an unknown type, and says so', () => {
    const h = pcbAgentHandlers(() => ctx());
    expect(h.explain({ type: 'clearance' })).toEqual({ type: 'clearance', explanation: 't:explain.clearance', known: true });
    expect(h.explain({ type: 'weird_new_check' })).toMatchObject({ explanation: 't:explain._other', known: false });
    expect(() => h.explain({})).toThrow(/^MISSING/);
  });

  it('showView refuses a view off the list', () => {
    const c = ctx({ current: project('StickHub', 'a') });
    expect(() => pcbAgentHandlers(() => c).showView({ view: 'settings' })).toThrow(/^INVALID/);
    pcbAgentHandlers(() => c).showView({ view: 'render' });
    expect(c.setView).toHaveBeenCalledWith('render');
  });

  it('keepSheet refuses before anything was checked or made', async () => {
    const h = pcbAgentHandlers(() => ctx({ current: project('StickHub', 'a') }));
    await expect(Promise.resolve().then(() => h.keepSheet({}))).rejects.toThrow(/^NOTHING_TO_KEEP/);
  });
});
