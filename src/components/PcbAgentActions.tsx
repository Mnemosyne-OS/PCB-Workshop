/**
 * Serves the workshop's agent actions (doc 149) while the window is open.
 *
 * A CHILD that renders nothing, never a hook in App (Loom's reason: a hook
 * added to App breaks the order of its hooks under hot reload). The handlers
 * live in `lib/pcbAgent.ts`; this keeps their view of the app fresh (a ref
 * written every render) and subscribes ONCE.
 */
import { useEffect, useRef } from 'react';
import { sdk } from '../lib/host';
import { pcbAgentHandlers, type PcbAgentContext } from '../lib/pcbAgent';

export function PcbAgentActions(props: PcbAgentContext): null {
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    if (typeof sdk.onAgentActions !== 'function') {
      console.warn('[PCB] this SDK build has no onAgentActions; reload the cartridge to serve agent actions');
      return undefined;
    }
    const sub = sdk.onAgentActions(pcbAgentHandlers(() => latest.current));
    sub.ready.catch((err: unknown) => console.warn('[PCB] agent actions not served:', err instanceof Error ? err.message : err));
    return () => sub.off();
  }, []);

  return null;
}
