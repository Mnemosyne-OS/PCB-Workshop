/**
 * host.ts — the one door between the PCB workshop and the shell.
 *
 * Actions used (doc 52, doc 218 §5): `kicad.*` (kicad:run), and
 * `permissions.refresh` / `vault.sandbox.ensure` / `social.ingest`
 * (vault:write, the board sheet, doc 58), `shell.openExternal` (links).
 *
 * The cartridge never holds a path: a project is an id from the host's list,
 * picked in the host's own file dialog.
 */
import { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import type { JobResult, KicadStatus, Project, Sources } from './types';

/** Must match "name" in mnemo-plugin.json: the host keys the project list on it. */
export const PLUGIN_ID = '@mnemosyne-plugins/pcb';

export const sdk = new MnemoCartridgeSDK(PLUGIN_ID);

/**
 * Deadlines per call (rule 9), above main's own per-step deadlines so main is
 * the one that answers KICAD_TIMEOUT. DRC on the largest KiCad demo took 77 s
 * (doc 218 §4.1); an order pack is four kicad-cli runs.
 */
export const TIMEOUT_MS = {
  quick: 15_000,
  drc: 6 * 60_000,
  erc: 3 * 60_000,
  orderPack: 9 * 60_000,
  step: 3 * 60_000,
  render: 4 * 60_000,
  sources: 60_000,
} as const;

/** True inside the Mnemosyne shell. Standalone (dev), nothing can run. */
export function hasHost(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

export function kicadStatus(): Promise<KicadStatus> {
  return sdk.invoke<KicadStatus>('kicad.status', undefined, TIMEOUT_MS.quick);
}

/** User-paced: the host opens its file dialog, so no timeout. */
export function declareProject(): Promise<Project> {
  return sdk.invoke<Project>('kicad.declareProject', undefined, 0);
}

export async function listProjects(): Promise<Project[]> {
  const res = await sdk.invoke<{ projects: Project[] }>('kicad.projects', undefined, TIMEOUT_MS.quick);
  return res.projects;
}

export function forgetProject(projectId: string): Promise<unknown> {
  return sdk.invoke('kicad.forgetProject', { projectId }, TIMEOUT_MS.quick);
}

export function readSources(projectId: string): Promise<Sources> {
  return sdk.invoke<Sources>('kicad.readSources', { projectId }, TIMEOUT_MS.sources);
}

export type RunJob =
  | { job: 'drc' | 'erc' | 'step' }
  | { job: 'orderPack'; fabricator: 'jlcpcb' }
  | { job: 'render'; side: 'top' | 'bottom' };

export function runJob(projectId: string, req: RunJob): Promise<JobResult> {
  return sdk.invoke<JobResult>('kicad.run', { projectId, ...req }, TIMEOUT_MS[req.job]);
}

export function reveal(projectId: string, job: RunJob['job']): Promise<unknown> {
  return sdk.invoke('kicad.reveal', { projectId, job }, TIMEOUT_MS.quick);
}

export function openExternal(url: string): Promise<unknown> {
  return sdk.invoke('shell.openExternal', { url }, TIMEOUT_MS.quick);
}

export class PermissionError extends Error {
  constructor() { super('PERMISSION_DENIED: vault:write not granted'); }
}

/**
 * Write the board sheet into this app's own sandbox vault, the house way
 * (MnemoParts `keepSheet`): the permission is re-read first, because a
 * manifest that gained `vault:write` is only enforced from the next start.
 */
export async function keepSheet(sheet: string, spineType: string): Promise<{ vault: string; unlocked: boolean }> {
  const refreshed = await sdk.invoke<{ granted?: Record<string, boolean> }>(
    'permissions.refresh', { permissions: ['vault:write'] }, TIMEOUT_MS.quick);
  if (refreshed?.granted?.['vault:write'] === false) throw new PermissionError();
  const { vault, unlocked } = await sdk.invoke<{ vault: string; unlocked: boolean }>('vault.sandbox.ensure', {}, TIMEOUT_MS.quick);
  await sdk.invoke('social.ingest', { vault, content: sheet, spineType }, TIMEOUT_MS.quick);
  return { vault, unlocked };
}

/** The code at the start of a refusal (`BUSY: …` → `BUSY`), or the whole message. */
export function errorCodeOf(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // The bridge refuses a missing permission in English prose (« Unauthorized:
  // This cartridge does not have… »): it is a refusal, said as one.
  if (/^Unauthorized\b/i.test(msg.trim())) return 'PERMISSION_DENIED';
  const m = /^([A-Z][A-Z0-9_]+)\b/.exec(msg.trim());
  return m?.[1] ?? msg;
}
