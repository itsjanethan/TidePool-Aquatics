// Converts the single-file build into a page body for hosts that supply their
// own <html>/<head>/<body> skeleton (e.g. claude.ai artifacts).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const src = readFileSync('dist-single/index.html', 'utf8');
const title = (src.match(/<title>[\s\S]*?<\/title>/) ?? ['<title>Tidepool Aquatics</title>'])[0];
const fonts = [...src.matchAll(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/g)].map((m) => m[0]).join('\n');
const styles = [...src.slice(0, src.lastIndexOf('</head>')).matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const headPart = src.slice(0, src.lastIndexOf('</head>'));
const scripts = [...headPart.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n');
// The bundle itself contains "<body" strings, so take the real body after </head>.
const afterHead = src.slice(src.lastIndexOf('</head>') + 7);
const body = afterHead.replace(/^[\s\S]*?<body>/, '').replace(/<\/body>[\s\S]*$/, '').replace(/<script[\s\S]*?<\/script>/g, '');
const host = `<style>
/* Single dark look: the game commits to its own palette in every theme. */
:root { --host-bg: #120f22; --host-fg: #f4f1e6; color-scheme: dark; }
html, body { height: 100%; background: var(--host-bg); color: var(--host-fg); }
#app { height: 100%; }
</style>`;
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/tidepool-aquatics.html', [title, fonts, host, styles, body.trim(), scripts].join('\n'));
console.log('wrote dist-artifact/tidepool-aquatics.html', (readFileSync('dist-artifact/tidepool-aquatics.html').length / 1024).toFixed(0), 'KB');
