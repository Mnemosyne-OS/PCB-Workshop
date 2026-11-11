/**
 * App on a fake host (`./lib/host` mocked), driven the way a person and an
 * agent do. Each test holds one fix of the cold review of doc 218 (§12):
 * the probes P1 to P7 of the verifier, turned into assertions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JobResult, Project, Report, Sources } from './lib/types';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const h = vi.hoisted(() => ({
  agent: null as null | Record<string, (args: Record<string, unknown>) => unknown>,
  projects: [] as Project[],
  runJob: null as null | ((projectId: string, req: { job: string }) => Promise<JobResult>),
  readSources: null as null | ((projectId: string) => Promise<Sources>),
  runs: [] as string[],
  reads: [] as string[],
}));

vi.mock('./lib/host', async (importOriginal) => {
  const real = await importOriginal<typeof import('./lib/host')>();
  return {
    PLUGIN_ID: 'test',
    hasHost: () => true,
    sdk: {
      onAgentActions: (handlers: Record<string, (args: Record<string, unknown>) => unknown>) => {
        h.agent = handlers;
        return { ready: Promise.resolve(), off: () => undefined };
      },
    },
    kicadStatus: () => Promise.resolve({ found: true, version: '10.0.8', supported: true, minMajor: 9 }),
    listProjects: () => Promise.resolve(h.projects),
    declareProject: () => Promise.reject(new Error('CANCELED')),
    forgetProject: (id: string) => { h.projects = h.projects.filter((p) => p.id !== id); return Promise.resolve(); },
    readSources: (id: string) => { h.reads.push(id); return h.readSources!(id); },
    runJob: (id: string, req: { job: string }) => { h.runs.push(`${req.job}@${id}`); return h.runJob!(id, req); },
    reveal: () => Promise.resolve(),
    openExternal: () => Promise.resolve(),
    keepSheet: () => Promise.resolve({ vault: 'APP-test', unlocked: false }),
    errorCodeOf: real.errorCodeOf,
  };
});

import App from './App';

const project = (id: string, name: string, over: Partial<Project> = {}): Project =>
  ({ id, name, addedAt: '', hasBoard: true, hasSchematic: true, missing: false, ...over });
const report = (errors: number): Report => ({
  kicadVersion: '10.0.8', truncated: false, counts: { error: errors, warning: 0, exclusion: 0, other: 0 },
  findings: Array.from({ length: errors }, () => ({ kind: 'violation' as const, type: 'clearance', severity: 'error' as const, text: '', items: [] })),
});
const SOURCES: Sources = { sources: [{ name: 'a.kicad_pcb', text: '(kicad_pcb)' }, { name: 'a.kicad_sch', text: '(kicad_sch)' }], rootSchematic: 'a.kicad_sch' };

const tile = (name: string) => screen.getAllByRole('button').find((b) => b.classList.contains('chip-tile') && b.textContent?.includes(name))!;
const tab = (label: string) => screen.getAllByRole('button').find((b) => b.closest('nav.tabs') && b.textContent?.includes(label))!;
const primary = () => document.querySelector('main .card .primary') as HTMLButtonElement;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const status = () => h.agent!.status({}) as { verdict: string; drc: unknown; erc: unknown; busy: unknown };

async function mount(): Promise<void> {
  render(<App />);
  await waitFor(() => { if (!h.agent) throw new Error('agent not served yet'); });
  await flush();
}

beforeEach(() => {
  window.localStorage.clear();
  h.agent = null; h.runs = []; h.reads = [];
  h.projects = [project('A', 'Alpha'), project('B', 'Bravo')];
  h.readSources = () => Promise.resolve(SOURCES);
  h.runJob = () => Promise.reject(new Error('UNSET'));
});
afterEach(() => cleanup());

describe('App, fixes of the cold review', () => {
  it('drops the report of a project the person left while its check ran', async () => {
    const drc = deferred<JobResult>();
    h.runJob = (_id, req) => (req.job === 'drc' ? drc.promise : Promise.resolve({ job: 'erc', report: report(0), ms: 1 } as JobResult));
    await mount();
    fireEvent.click(tile('Alpha')); await flush();
    fireEvent.click(tab('Check')); await flush();
    fireEvent.click(primary()); await flush();
    fireEvent.click(tile('Bravo')); await flush();
    await act(async () => { drc.resolve({ job: 'drc', report: report(3), ms: 1 }); await Promise.resolve(); });
    await flush();
    expect(status().drc).toBeNull();
    expect(h.runs).toEqual(['drc@A']);
  });

  it('a second check that fails half way leaves no old report behind', async () => {
    let round = 0;
    h.runJob = (_id, req) => {
      if (req.job === 'drc') { round++; return Promise.resolve({ job: 'drc', report: report(round === 1 ? 2 : 0), ms: 1 } as JobResult); }
      return round === 1 ? Promise.resolve({ job: 'erc', report: report(0), ms: 1 } as JobResult) : Promise.reject(new Error('KICAD_TIMEOUT'));
    };
    await mount();
    fireEvent.click(tile('Alpha')); await flush();
    fireEvent.click(tab('Check')); await flush();
    fireEvent.click(primary()); await flush();
    expect(status().verdict).toBe('blocked');
    fireEvent.click(primary()); await flush();
    expect(status().verdict).toBe('unknown');
    expect(status().erc).toBeNull();
  });

  it('checks only what the project has, and judges a board-only project on its DRC', async () => {
    h.projects = [project('M', 'Microwave', { hasSchematic: false })];
    h.runJob = () => Promise.resolve({ job: 'drc', report: report(0), ms: 1 } as JobResult);
    await mount();
    fireEvent.click(tile('Microwave')); await flush();
    fireEvent.click(tab('Check')); await flush();
    fireEvent.click(primary()); await flush();
    expect(h.runs).toEqual(['drc@M']);
    expect(status().verdict).toBe('clean');
  });

  it('refuses a second agent job in the same tick without clearing the running one', async () => {
    const first = deferred<JobResult>();
    h.runJob = () => first.promise;
    await mount();
    fireEvent.click(tile('Alpha')); await flush();
    fireEvent.click(tab('Order pack')); await flush();
    await act(async () => {
      h.agent!.orderPack({});
      h.agent!.render({});
      await Promise.resolve();
    });
    await flush();
    expect(h.runs).toEqual(['orderPack@A']);
    expect(status().busy).toBe('orderPack');
    expect(primary().disabled).toBe(true);
  });

  it('keeps the viewer when nothing about the board changed', async () => {
    let made = 0;
    const real = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string, o?: ElementCreationOptions) => {
      if (tag === 'kicanvas-embed') made++;
      return real(tag, o);
    }));
    await mount();
    fireEvent.click(tile('Alpha')); await flush(); await flush();
    const opened = made;
    fireEvent.click(screen.getByRole('radio', { name: 'Pro' })); await flush();
    spy.mockRestore();
    expect(opened).toBeGreaterThan(0);
    expect(made).toBe(opened);
  });

  it('reads the files again after a failed read when the person changes tab', async () => {
    let fail = true;
    h.readSources = () => (fail ? Promise.reject(new Error('PROJECT_GONE')) : Promise.resolve(SOURCES));
    await mount();
    fireEvent.click(tile('Alpha')); await flush();
    fail = false;
    fireEvent.click(tab('Schematic')); await flush();
    expect(h.reads).toEqual(['A', 'A']);
    expect(document.querySelector('kicanvas-embed')).not.toBeNull();
  });

  it('reads the files again after a failed read, on « Read again »', async () => {
    let fail = true;
    h.readSources = () => (fail ? Promise.reject(new Error('PROJECT_GONE')) : Promise.resolve(SOURCES));
    await mount();
    fireEvent.click(tile('Alpha')); await flush();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Read again' })); await flush();
    expect(h.reads).toEqual(['A', 'A']);
    expect(document.querySelector('kicanvas-embed')).not.toBeNull();
  });

  it('forgets the reports of a project removed from the list', async () => {
    h.projects = [project('A', 'Alpha')];
    h.runJob = (_id, req) => Promise.resolve({ job: req.job, report: report(req.job === 'drc' ? 4 : 0), ms: 1 } as JobResult);
    await mount();
    fireEvent.click(tile('Alpha')); await flush();
    fireEvent.click(tab('Check')); await flush();
    fireEvent.click(primary()); await flush();
    expect(status().verdict).toBe('blocked');
    fireEvent.click(screen.getAllByRole('button').find((b) => b.classList.contains('forget'))!); await flush();
    expect(status()).toMatchObject({ drc: null, erc: null, verdict: 'unknown' });
  });
});
