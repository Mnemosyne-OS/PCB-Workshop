/**
 * App — the PCB workshop (doc 218): one KiCad project at a time, five views
 * (board, schematic, check, order pack, render), one level setting.
 *
 * State per project (reports, pack, render) is dropped when another project
 * opens: a report must never be read as another board's.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from './i18n/useI18n';
import {
  declareProject, errorCodeOf, forgetProject, hasHost, keepSheet, kicadStatus, listProjects,
  readSources, reveal, runJob,
} from './lib/host';
import { boardSheet, SHEET_SPINE } from './lib/sheet';
import { VIEWS, type Busy, type View } from './lib/pcbAgent';
import { LEVELS, type JobResult, type KicadStatus, type Level, type Project, type Report, type Sources } from './lib/types';
import { PcbAgentActions } from './components/PcbAgentActions';
import { CheckView, FirstSteps, OrderView, RenderView, SourcesView } from './components/Views';

type Load<T> = { kind: 'loading' } | { kind: 'error'; code: string } | { kind: 'ready'; value: T };

const LS_LEVEL = 'pcb.level';
const LS_PROJECT = 'pcb.project';

/** localStorage is a comfort here (doc 218 §7, style §4): a failure is logged, never fatal. */
function readLs(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch (err) { console.warn('[PCB] localStorage read failed:', err); return null; }
}
function writeLs(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch (err) { console.warn('[PCB] localStorage write failed:', err); }
}

export default function App(): JSX.Element {
  const { t, lang } = useI18n();
  const [kicad, setKicad] = useState<Load<KicadStatus>>({ kind: 'loading' });
  const [projects, setProjects] = useState<Load<Project[]>>({ kind: 'loading' });
  const [currentId, setCurrentId] = useState<string | null>(() => readLs(LS_PROJECT));
  const [view, setView] = useState<View>('board');
  const [level, setLevelState] = useState<Level>(() => {
    const v = readLs(LS_LEVEL);
    return (LEVELS as readonly string[]).includes(v ?? '') ? (v as Level) : 'beginner';
  });
  const [busy, setBusy] = useState<Busy>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [sources, setSources] = useState<Load<Sources> | null>(null);
  const [drc, setDrc] = useState<Report | null>(null);
  const [erc, setErc] = useState<Report | null>(null);
  const [checkMs, setCheckMs] = useState<number | null>(null);
  const [pack, setPack] = useState<Extract<JobResult, { job: 'orderPack' }> | null>(null);
  const [render, setRender] = useState<Extract<JobResult, { job: 'render' }> | null>(null);
  const [step, setStep] = useState<Extract<JobResult, { job: 'step' }> | null>(null);
  /** `idle`, `saving`, `saved`, or the error code of a failed keep. */
  const [kept, setKept] = useState<string>('idle');

  const setLevel = (l: Level) => { setLevelState(l); writeLs(LS_LEVEL, l); };

  const refreshProjects = useCallback(async () => {
    try {
      setProjects({ kind: 'ready', value: await listProjects() });
    } catch (err) {
      console.warn('[PCB] project list failed:', err);
      setProjects({ kind: 'error', code: errorCodeOf(err) });
    }
  }, []);

  const askKicad = useCallback(() => {
    kicadStatus()
      .then((s) => setKicad({ kind: 'ready', value: s }))
      .catch((err: unknown) => {
        console.warn('[PCB] kicad status failed:', err);
        setKicad({ kind: 'error', code: errorCodeOf(err) });
      });
  }, []);

  useEffect(() => {
    if (!hasHost()) {
      setKicad({ kind: 'error', code: 'NO_HOST' });
      setProjects({ kind: 'error', code: 'NO_HOST' });
      return undefined;
    }
    askKicad();
    void refreshProjects();
    return undefined;
  }, [askKicad, refreshProjects]);

  // KiCad may be installed while the window is open: asked again each time the
  // window comes back to the front, until it is found (cold review, finding 11).
  const kicadUsable = kicad.kind === 'ready' && kicad.value.found && kicad.value.supported;
  useEffect(() => {
    if (kicadUsable || !hasHost()) return undefined;
    const onFocus = () => askKicad();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [kicadUsable, askKicad]);

  const list = projects.kind === 'ready' ? projects.value : null;
  const current = useMemo(() => list?.find((p) => p.id === currentId) ?? null, [list, currentId]);

  // 🪤 Re-opening the open project changes nothing: it used to clear the
  // reports and the viewer's text while no effect re-read them (seen at 375 px
  // in the harness, 2026-11-10: « Reading » forever).
  const openId = useRef(currentId);
  const sourcesFor = useRef<string | null>(null);
  /** Bumped by « Read again »: the viewer reads the files anew (after an edit in KiCad, or a failed read). */
  const [sourcesTick, setSourcesTick] = useState(0);
  /** Everything that belongs to the open project, dropped when it changes or is removed. */
  const clearProjectState = useCallback(() => {
    setDrc(null); setErc(null); setCheckMs(null); setPack(null); setRender(null); setStep(null);
    setSources(null); setLastError(null); setKept('idle');
    sourcesFor.current = null;
  }, []);
  const openProject = useCallback((id: string) => {
    if (id === openId.current) return;
    openId.current = id;
    setCurrentId(id);
    writeLs(LS_PROJECT, id);
    clearProjectState();
  }, [clearProjectState]);
  const readAgain = useCallback(() => {
    sourcesFor.current = null;
    setSourcesTick((n) => n + 1);
  }, []);

  // The viewer's text is read when a drawing view is shown, once per project.
  // 🪤 Keyed by the project asked for, not by an `alive` flag: the effect's own
  // `setSources` re-ran it, its cleanup dropped the answer, and the view stayed
  // on « Reading » forever (seen in the harness, 2026-11-10). An answer is kept
  // when it is still for the project asked last.
  useEffect(() => {
    if (!current || (view !== 'board' && view !== 'schematic')) return;
    if (sourcesFor.current === current.id) return;
    const id = current.id;
    sourcesFor.current = id;
    setSources({ kind: 'loading' });
    readSources(id)
      .then((s) => { if (sourcesFor.current === id) setSources({ kind: 'ready', value: s }); })
      .catch((err: unknown) => {
        console.warn('[PCB] sources failed:', err);
        if (sourcesFor.current !== id) return;
        setSources({ kind: 'error', code: errorCodeOf(err) });
        // A failed read is not kept as done: the next tab change or « Read
        // again » asks anew (cold review, finding 10).
        sourcesFor.current = null;
      });
  }, [current, view, sourcesTick]);

  /**
   * One long job at a time, for the screen AND the agent. The ref answers at
   * once: two agent calls in the same tick both saw `busy` null in state, and
   * the refused one's `finally` cleared the running one's flag (finding 13).
   */
  const busyRef = useRef<Busy>(null);
  const guarded = useCallback(async (what: NonNullable<Busy>, fn: () => Promise<void>) => {
    if (busyRef.current) { setLastError('BUSY'); return; }
    busyRef.current = what;
    setBusy(what);
    setLastError(null);
    try {
      await fn();
    } catch (err) {
      console.warn(`[PCB] ${what} failed:`, err);
      setLastError(errorCodeOf(err));
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }, []);

  /**
   * A job's answer is shown only if its project is still the open one: a
   * DRC takes up to 77 s, and the person may open another board meanwhile.
   */
  const stillOpen = (projectId: string) => openId.current === projectId;

  /**
   * One check = the DRC when the project has a board, the ERC when it has a
   * schematic. Both reports are dropped first: a second check that fails half
   * way showed the NEW DRC beside the OLD ERC, as « Ready to order », and
   * « Keep in memory » wrote that mix (cold review, findings 2 and 9).
   */
  const check = useCallback((projectId: string) => guarded('check', async () => {
    const p = list?.find((x) => x.id === projectId);
    if (!p) throw new Error('UNKNOWN_PROJECT');
    setDrc(null); setErc(null); setCheckMs(null);
    const started = Date.now();
    if (p.hasBoard) {
      const d = await runJob(projectId, { job: 'drc' });
      if (!stillOpen(projectId)) return;
      if (d.job === 'drc') setDrc(d.report);
    }
    if (p.hasSchematic) {
      const e = await runJob(projectId, { job: 'erc' });
      if (!stillOpen(projectId)) return;
      if (e.job === 'erc') setErc(e.report);
    }
    setCheckMs(Date.now() - started);
  }), [guarded, list]);

  // Each job drops its previous result first: after a failed run, the old
  // pack stayed on screen while its files were already removed (finding 15).
  const makeOrderPack = useCallback((projectId: string) => guarded('orderPack', async () => {
    setPack(null);
    const r = await runJob(projectId, { job: 'orderPack', fabricator: 'jlcpcb' });
    if (stillOpen(projectId) && r.job === 'orderPack') setPack(r);
  }), [guarded]);

  const renderBoard = useCallback((projectId: string, side: 'top' | 'bottom') => guarded('render', async () => {
    setRender(null);
    const r = await runJob(projectId, { job: 'render', side });
    if (stillOpen(projectId) && r.job === 'render') setRender(r);
  }), [guarded]);

  const makeStep = useCallback((projectId: string) => guarded('step', async () => {
    setStep(null);
    const r = await runJob(projectId, { job: 'step' });
    if (stillOpen(projectId) && r.job === 'step') setStep(r);
  }), [guarded]);

  const keep = useCallback(async (note: string) => {
    if (!current) throw new Error('NO_PROJECT');
    const sheet = boardSheet({
      board: current.name, at: new Date(),
      kicadVersion: kicad.kind === 'ready' ? kicad.value.version : null,
      drc, erc,
      orderPack: pack ? { fabricator: pack.fabricator, zipName: pack.zipName, files: pack.files.length } : null,
      note,
    });
    return keepSheet(sheet, SHEET_SPINE);
  }, [current, kicad, drc, erc, pack]);

  const keepFromScreen = async () => {
    setKept('saving');
    try { await keep(''); setKept('saved'); } catch (err) {
      console.warn('[PCB] keep failed:', err);
      setKept(errorCodeOf(err));
    }
  };

  const addProject = async () => {
    try {
      const p = await declareProject();
      await refreshProjects();
      openProject(p.id);
    } catch (err) {
      const code = errorCodeOf(err);
      if (code !== 'CANCELED') { console.warn('[PCB] add project failed:', err); setLastError(code); }
    }
  };

  const removeProject = async (id: string) => {
    try {
      await forgetProject(id);
      if (id === currentId) {
        setCurrentId(null); openId.current = null; writeLs(LS_PROJECT, '');
        clearProjectState();
      }
      await refreshProjects();
    } catch (err) {
      console.warn('[PCB] forget failed:', err);
      setLastError(errorCodeOf(err));
    }
  };

  const showFile = (job: 'drc' | 'orderPack' | 'step' | 'render') => {
    if (!current) return;
    reveal(current.id, job).catch((err: unknown) => {
      console.warn('[PCB] reveal failed:', err);
      setLastError(errorCodeOf(err));
    });
  };

  const errText = (code: string) => {
    const k = `error.${code}`;
    const s = t(k);
    return s === k ? t('error.generic', { code }) : s;
  };

  const kicadReady = kicadUsable;
  /** What a check covers for the open project: the verdict waits for both only when both exist. */
  const needs = { board: !!current?.hasBoard, schematic: !!current?.hasSchematic };

  return (
    <div className="pcb-root">
      {list && (
        <PcbAgentActions
          kicad={kicad.kind === 'ready' ? kicad.value : null} needs={needs} projects={list} current={current} view={view} busy={busy} lastError={lastError}
          drc={drc} erc={erc}
          orderPack={pack ? { zipName: pack.zipName, files: pack.files.length } : null}
          render={render ? { side: render.side } : null}
          t={t} openProject={openProject} setView={setView}
          check={check} makeOrderPack={makeOrderPack} renderBoard={renderBoard} keepSheet={keep}
        />
      )}

      <header className="top panel">
        <div className="brand">
          <span className="lab">01</span>
          <h1>{t('app.title')}</h1>
        </div>
        <div className="kicad-chip chip" aria-live="polite">
          <span className="lab">KICAD</span>
          {kicad.kind === 'loading' && <span>{t('kicad.looking')}</span>}
          {kicad.kind === 'error' && <span className="bad">{errText(kicad.code)}</span>}
          {kicad.kind === 'ready' && !kicad.value.found && <span className="bad">{t('kicad.absent')}</span>}
          {kicad.kind === 'ready' && kicad.value.found && (
            <span className={kicad.value.supported ? 'ok' : 'bad'}>
              {kicad.value.version ?? '?'}{kicad.value.supported ? '' : ` · ${t('kicad.tooOld', { min: kicad.value.minMajor })}`}
            </span>
          )}
        </div>
        <div className="segmented" role="radiogroup" aria-label={t('level.label')}>
          {LEVELS.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={level === l}
              className={level === l ? 'chosen' : ''} onClick={() => setLevel(l)}>{t(`level.${l}`)}</button>
          ))}
        </div>
      </header>

      <div className="body">
        <aside className="rail panel" aria-label={t('projects.label')}>
          <div className="rail-head">
            <span className="lab">02 · {t('projects.label')}</span>
            <button type="button" className="primary" onClick={() => void addProject()} disabled={!hasHost()}>
              {t('projects.add')}
            </button>
          </div>
          {projects.kind === 'loading' && <p className="muted">{t('state.loading')}</p>}
          {projects.kind === 'error' && <p className="bad">{errText(projects.code)}</p>}
          {list && list.length === 0 && <p className="muted">{t('projects.none')}</p>}
          {list && (
            <ul className="project-list">
              {list.map((p) => (
                <li key={p.id}>
                  <button type="button" className={`chip-tile${p.id === currentId ? ' chosen' : ''}`}
                    onClick={() => openProject(p.id)} aria-pressed={p.id === currentId}>
                    <span className="p-name">{p.name}</span>
                    <span className="lab">
                      {p.missing ? t('projects.missing') : [p.hasBoard ? t('projects.board') : null, p.hasSchematic ? t('projects.schematic') : null].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  <button type="button" className="icon-btn forget" aria-label={t('projects.forget', { name: p.name })}
                    title={t('projects.forget', { name: p.name })} onClick={() => void removeProject(p.id)}>
                    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" /></svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="work">
          {lastError && (
            <div className="alert" role="alert">
              <span>{errText(lastError)}</span>
              <button type="button" className="icon-btn" aria-label={t('action.dismiss')} onClick={() => setLastError(null)}>
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" /></svg>
              </button>
            </div>
          )}

          {!current && <FirstSteps t={t} level={level} kicad={kicad.kind === 'ready' ? kicad.value : null} />}

          {current && (
            <>
              <nav className="tabs" aria-label={t('views.label')}>
                {VIEWS.map((v, i) => (
                  <button key={v} type="button" className={view === v ? 'chosen' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
                    <span className="lab">{String(i + 1).padStart(2, '0')}</span> {t(`views.${v}`)}
                  </button>
                ))}
                <span className="tabs-name lab">{current.name}</span>
              </nav>

              {(view === 'board' || view === 'schematic') && (
                <SourcesView t={t} view={view} sources={sources} errText={errText} onReadAgain={readAgain} />
              )}
              {view === 'check' && (
                <CheckView
                  t={t} lang={lang} level={level} busy={busy} disabled={!kicadReady || !!busy}
                  drc={drc} erc={erc} needs={needs} ms={checkMs} kept={kept}
                  onCheck={() => void check(current.id)} onKeep={() => void keepFromScreen()} errText={errText}
                />
              )}
              {view === 'order' && (
                <OrderView
                  t={t} lang={lang} busy={busy} disabled={!kicadReady || !!busy || !current.hasSchematic}
                  pack={pack} drc={drc} erc={erc} needs={needs} level={level}
                  onMake={() => void makeOrderPack(current.id)} onShow={() => showFile('orderPack')}
                />
              )}
              {view === 'render' && (
                <RenderView
                  t={t} lang={lang} busy={busy} disabled={!kicadReady || !!busy || !current.hasBoard}
                  render={render} step={step}
                  onRender={(side) => void renderBoard(current.id, side)} onStep={() => void makeStep(current.id)}
                  onShowStep={() => showFile('step')}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
