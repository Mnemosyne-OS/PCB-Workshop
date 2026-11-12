import React from 'react';
import ReactDOM from 'react-dom/client';
import { onHostConfig } from './sdk/mnemo-sdk';
import App from './App';
import './app.css';
import { adoptHostLang } from './i18n/useI18n';

/**
 * KiCanvas (MIT, public/vendor/KICANVAS-LICENSE.md), the board and schematic
 * viewer: a prebuilt web-component bundle served from this cartridge. Added at
 * run time because Vite refuses to transform a file of public/ named in
 * index.html. It defines <kicanvas-embed> when it loads; an element made
 * before that is upgraded then.
 */
const kicanvas = document.createElement('script');
kicanvas.type = 'module';
kicanvas.src = `${import.meta.env.BASE_URL}vendor/kicanvas.js`;
kicanvas.onerror = () => console.error('[PCB] the KiCanvas viewer could not be loaded');
document.head.appendChild(kicanvas);

/**
 * The workshop follows the app's theme (style-cartouche §0): the SDK writes the
 * host's live variables on :root, app.css only reads them. The KiCanvas drawing
 * keeps KiCad's own dark canvas in every theme, like a photo in a lightbox.
 */
onHostConfig((cfg) => {
  adoptHostLang(cfg.lang);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
