/**
 * Views — the five working views of the workshop and the first-steps card.
 *
 * Every view handles its three states (rule 11): nothing run yet, running,
 * a result. Errors of a run come up in App's alert line.
 */
import { useMemo, useState } from 'react';
import { KicadViewer } from './KicadViewer';
import { explainKey, formatBytes, formatSeconds, groupFindings, verdictOf, type FindingGroup } from '../lib/findings';
import { openExternal } from '../lib/host';
import type { Busy } from '../lib/pcbAgent';
import type { JobResult, KicadStatus, Level, Report, Sources } from '../lib/types';

type T = (key: string, vars?: Record<string, string | number>) => string;
type Load<V> = { kind: 'loading' } | { kind: 'error'; code: string } | { kind: 'ready'; value: V };

const KICAD_DOWNLOAD = 'https://www.kicad.org/download/';
const JLCPCB_QUOTE = 'https://cart.jlcpcb.com/quote';

function Spinner({ label }: { label: string }): JSX.Element {
  return <span className="running" role="status"><span className="pulse" aria-hidden="true" />{label}</span>;
}

function open(url: string): void {
  openExternal(url).catch((err: unknown) => console.warn('[PCB] open link failed:', err));
}

/** Doc 218 §7 and lot 7a: the beginner's path, one line per step. */
export function FirstSteps({ t, level, kicad }: { t: T; level: Level; kicad: KicadStatus | null }): JSX.Element {
  const installed = !!kicad?.found && kicad.supported;
  const steps = ['install', 'demo', 'add', 'check', 'render', 'order'] as const;
  return (
    <section className="card panel first">
      <span className="lab">{t('first.label')}</span>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s} className={s === 'install' && installed ? 'done' : ''}>
            <span className="num">{s === 'install' && installed ? '✓' : String(i + 1).padStart(2, '0')}</span>
            <span>{t(`first.${s}`)}</span>
            {s === 'install' && !installed && (
              <button type="button" className="link" onClick={() => open(KICAD_DOWNLOAD)}>{t('first.download')} ↗</button>
            )}
          </li>
        ))}
      </ol>
      {level === 'beginner' && <p className="muted small">{t('first.demoWhere')}</p>}
    </section>
  );
}

/** The board or the schematic drawn by KiCanvas, with « Read again » for a board edited in KiCad meanwhile. */
export function SourcesView({ t, view, sources, errText, onReadAgain }: {
  t: T; view: 'board' | 'schematic'; sources: Load<Sources> | null; errText: (c: string) => string; onReadAgain: () => void;
}): JSX.Element {
  // Memoised on the sources themselves: a fresh array at every render rebuilt
  // the viewer (and lost the person's zoom) on each level click or agent job
  // (cold review, finding 5).
  const value = sources?.kind === 'ready' ? sources.value : null;
  const files = useMemo(
    () => (value ? value.sources.filter((f) => (view === 'board' ? f.name.endsWith('.kicad_pcb') : f.name.endsWith('.kicad_sch'))) : []),
    [value, view],
  );
  const again = <button type="button" onClick={onReadAgain}>{t('views.readAgain')}</button>;
  if (!sources || sources.kind === 'loading') return <section className="card panel center"><Spinner label={t('state.reading')} /></section>;
  if (sources.kind === 'error') {
    return <section className="card panel center"><div><p className="bad">{errText(sources.code)}</p>{again}</div></section>;
  }
  const tooLarge = view === 'board' ? sources.value.boardTooLarge : sources.value.schematicTooLarge;
  if (tooLarge) return <section className="card panel center"><p className="muted">{t('error.SOURCES_TOO_LARGE')}</p></section>;
  if (!files.length) return <section className="card panel center"><p className="muted">{t(view === 'board' ? 'views.noBoard' : 'views.noSchematic')}</p></section>;
  return (
    <section className="card panel viewer-card">
      <div className="viewer-bar">{again}</div>
      <KicadViewer files={files} label={t(`views.${view}`)} />
    </section>
  );
}

function GroupRow({ g, t, level }: { g: FindingGroup; t: T; level: Level }): JSX.Element {
  const [opened, setOpened] = useState(level === 'beginner');
  return (
    <li className={`finding sev-${g.severity}`}>
      <button type="button" className="finding-head" aria-expanded={opened} onClick={() => setOpened((o) => !o)}>
        <span className="sev lab">{t(`severity.${g.severity}`)}</span>
        <span className="f-type">{g.type}</span>
        <span className="count lab">×{g.count}</span>
      </button>
      {opened && (
        <div className="finding-body">
          <p>{t(explainKey(g.type))}</p>
          {g.severity === 'exclusion' && <p className="muted small">{t('check.excluded')}{g.comment ? ` · « ${g.comment} »` : ''}</p>}
          {level === 'pro' && g.sample && <p className="muted small">KiCad · {g.sample}</p>}
          {g.places.length > 0 && (
            <p className="muted small mono">
              {g.places.map((p) => `${p.text ? `${p.text} ` : ''}(${p.x.toFixed(2)}, ${p.y.toFixed(2)}) mm`).join(' · ')}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function ReportBlock({ title, report, t, level }: { title: string; report: Report | null; t: T; level: Level }): JSX.Element {
  if (!report) return <div className="report"><h3 className="lab">{title}</h3><p className="muted">{t('check.notRun')}</p></div>;
  const groups = groupFindings(report.findings);
  return (
    <div className="report">
      <h3 className="lab">{title} · {t('check.counts', { errors: report.counts.error, warnings: report.counts.warning })}</h3>
      {report.truncated && <p className="muted small">{t('check.truncated')}</p>}
      {groups.length === 0 ? <p className="ok">{t('check.none')}</p> : (
        <ul className="findings">{groups.map((g) => <GroupRow key={`${g.severity}|${g.type}`} g={g} t={t} level={level} />)}</ul>
      )}
    </div>
  );
}

export function CheckView(p: {
  t: T; lang: string; level: Level; busy: Busy; disabled: boolean; drc: Report | null; erc: Report | null; needs: { board: boolean; schematic: boolean }; ms: number | null;
  kept: string; onCheck: () => void; onKeep: () => void; errText: (c: string) => string;
}): JSX.Element {
  const { t } = p;
  const verdict = verdictOf(p.drc, p.erc, p.needs);
  return (
    <section className="card panel">
      <div className="bar">
        <button type="button" className="primary" disabled={p.disabled} onClick={p.onCheck}>{t('check.run')}</button>
        {p.busy === 'check' && <Spinner label={t('check.running')} />}
        {p.ms !== null && p.busy !== 'check' && <span className="lab">{formatSeconds(p.ms, p.lang)}</span>}
        <span className={`verdict v-${verdict}`}>{t(`verdict.${verdict}`)}</span>
      </div>
      <div className="reports">
        {p.needs.board
          ? <ReportBlock title={t('check.drc')} report={p.drc} t={t} level={p.level} />
          : <div className="report"><h3 className="lab">{t('check.drc')}</h3><p className="muted">{t('views.noBoard')}</p></div>}
        {p.needs.schematic
          ? <ReportBlock title={t('check.erc')} report={p.erc} t={t} level={p.level} />
          : <div className="report"><h3 className="lab">{t('check.erc')}</h3><p className="muted">{t('views.noSchematic')}</p></div>}
      </div>
      {(p.drc || p.erc) && (
        <div className="bar foot">
          <button type="button" disabled={p.kept === 'saving'} onClick={p.onKeep}>{t('keep.button')}</button>
          {p.kept === 'saved' && <span className="ok">{t('keep.saved')}</span>}
          {p.kept !== 'idle' && p.kept !== 'saving' && p.kept !== 'saved' && <span className="bad">{p.errText(p.kept)}</span>}
        </div>
      )}
    </section>
  );
}

export function OrderView(p: {
  t: T; lang: string; level: Level; busy: Busy; disabled: boolean; drc: Report | null; erc: Report | null; needs: { board: boolean; schematic: boolean };
  pack: Extract<JobResult, { job: 'orderPack' }> | null; onMake: () => void; onShow: () => void;
}): JSX.Element {
  const { t } = p;
  const verdict = verdictOf(p.drc, p.erc, p.needs);
  return (
    <section className="card panel">
      <div className="bar">
        <div className="segmented" role="radiogroup" aria-label={t('order.maker')}>
          <button type="button" role="radio" aria-checked className="chosen">JLCPCB</button>
        </div>
        <button type="button" className="primary" disabled={p.disabled} onClick={p.onMake}>{t('order.make')}</button>
        {p.busy === 'orderPack' && <Spinner label={t('order.running')} />}
      </div>
      {verdict !== 'clean' && <p className={verdict === 'blocked' ? 'bad' : 'muted'}>{t(`order.before.${verdict}`)}</p>}
      {!p.pack && p.busy !== 'orderPack' && <p className="muted">{t('order.empty')}</p>}
      {p.pack && (
        <div className="pack">
          <div className="pack-head">
            <span className="mono">{p.pack.zipName}</span>
            <span className="lab">{formatBytes(p.pack.zipBytes, p.lang)} · {formatSeconds(p.pack.ms, p.lang)}</span>
          </div>
          <ol className="steps">
            <li><span className="num">01</span><span>{t('order.step.zip', { zip: p.pack.zipName })}</span></li>
            <li><span className="num">02</span><span>{t('order.step.assembly')}</span></li>
            <li>
              <span className="num">03</span><span>{t('order.step.upload')}</span>
              <button type="button" className="link" onClick={() => open(JLCPCB_QUOTE)}>JLCPCB ↗</button>
            </li>
          </ol>
          {p.pack.bomWithoutPart > 0 && (
            <p className="warn">{t('order.withoutPart', { n: p.pack.bomWithoutPart, total: p.pack.bomLines })}</p>
          )}
          <div className="bar">
            <button type="button" onClick={p.onShow}>{t('action.showFolder')}</button>
          </div>
          {p.level !== 'beginner' && (
            <>
              <p className="lab">{t('order.layers')}</p>
              <p className="mono small">{p.pack.layers.join(' · ')}</p>
              <p className="lab">{t('order.files', { n: p.pack.files.length })}</p>
              <p className="mono small">{p.pack.files.join(' · ')}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function RenderView(p: {
  t: T; lang: string; busy: Busy; disabled: boolean;
  render: Extract<JobResult, { job: 'render' }> | null; step: Extract<JobResult, { job: 'step' }> | null;
  onRender: (side: 'top' | 'bottom') => void; onStep: () => void; onShowStep: () => void;
}): JSX.Element {
  const { t } = p;
  const [side, setSide] = useState<'top' | 'bottom'>('top');
  const [full, setFull] = useState(false);
  return (
    <div className="grid">
      <section className="card panel full">
        <div className="bar">
          <div className="segmented" role="radiogroup" aria-label={t('render.side')}>
            {(['top', 'bottom'] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={side === s} className={side === s ? 'chosen' : ''} onClick={() => setSide(s)}>
                {t(`render.${s}`)}
              </button>
            ))}
          </div>
          <button type="button" className="primary" disabled={p.disabled} onClick={() => p.onRender(side)}>{t('render.run')}</button>
          {p.busy === 'render' && <Spinner label={t('render.running')} />}
          {p.render && p.busy !== 'render' && <span className="lab">{t(`render.${p.render.side}`)} · {formatSeconds(p.render.ms, p.lang)}</span>}
        </div>
        {p.render ? (
          <button type="button" className="shot" onClick={() => setFull(true)} aria-label={t('render.enlarge')}>
            <img src={p.render.dataUrl} alt={t('render.alt', { side: t(`render.${p.render.side}`) })} />
          </button>
        ) : p.busy !== 'render' && <p className="muted">{t('render.empty')}</p>}
      </section>

      <section className="card panel">
        <span className="lab">{t('step.label')}</span>
        <div className="bar">
          <button type="button" disabled={p.disabled} onClick={p.onStep}>{t('step.make')}</button>
          {p.busy === 'step' && <Spinner label={t('step.running')} />}
        </div>
        {p.step && (
          <>
            <p><span className="mono">{p.step.fileName}</span> <span className="lab">{formatBytes(p.step.bytes, p.lang)}</span></p>
            <p className="muted small">{t('step.parts')}</p>
            <button type="button" onClick={p.onShowStep}>{t('action.showFolder')}</button>
          </>
        )}
      </section>

      {full && p.render && (
        // Style §5: a click anywhere closes, the image included.
        <div className="fullview" role="dialog" aria-label={t('render.enlarge')} onClick={() => setFull(false)}>
          <button type="button" className="icon-btn close" aria-label={t('action.close')} onClick={() => setFull(false)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
          <img src={p.render.dataUrl} alt={t('render.alt', { side: t(`render.${p.render.side}`) })} />
        </div>
      )}
    </div>
  );
}
