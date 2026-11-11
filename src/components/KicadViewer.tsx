/**
 * KicadViewer — the board or the schematic, drawn by KiCanvas (MIT,
 * `public/vendor/kicanvas.js`, loaded by index.html).
 *
 * The files reach KiCanvas as INLINE sources (`<kicanvas-source name=…>text`),
 * because the cartridge never holds a path: the host hands the text over
 * (`kicad.readSources`). Lot 0 measured KiCanvas reading KiCad 10.0.8 files.
 * The element is built by hand, outside React's tree, and removed on unmount.
 */
import { useEffect, useRef } from 'react';

export function KicadViewer({ files, label }: { files: Array<{ name: string; text: string }>; label: string }): JSX.Element {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || !files.length) return undefined;
    const embed = document.createElement('kicanvas-embed');
    embed.setAttribute('controls', 'full');
    embed.setAttribute('controlslist', 'nodownload');
    for (const f of files) {
      const src = document.createElement('kicanvas-source');
      src.setAttribute('name', f.name);
      src.textContent = f.text;
      embed.appendChild(src);
    }
    el.appendChild(embed);
    return () => { embed.remove(); };
  }, [files]);

  return <div ref={host} className="viewer" role="img" aria-label={label} />;
}
