import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Stamps the service worker with a unique build id and the list of built
 * files, so each deploy uses a fresh cache and players never get a stale mix.
 */
function serviceWorkerVersion(): Plugin {
  let outDir = 'dist';
  const files: string[] = [];
  return {
    name: 'tidepool-sw-version',
    apply: 'build',
    configResolved(cfg) {
      outDir = cfg.build.outDir;
    },
    generateBundle(_opts, bundle) {
      for (const name of Object.keys(bundle)) if (!name.endsWith('.map')) files.push(`./${name}`);
    },
    closeBundle() {
      const sw = resolve(outDir, 'sw.js');
      if (!existsSync(sw)) return;
      const id = `${pkg.version}-${Date.now().toString(36)}`;
      const src = readFileSync(sw, 'utf8')
        .replace('__BUILD_ID__', id)
        .replace('/*__PRECACHE__*/ []', JSON.stringify([...files.filter((f) => f !== './index.html'), './manifest.webmanifest', './icon.svg']));
      writeFileSync(sw, src);
    },
  };
}

/**
 * Base path. Relative ('./') by default so the build works from any folder,
 * a zip, file:// and the single-file artifact. GitHub Pages can set
 * BASE_PATH=/<repo>/ for absolute URLs; relative also works there.
 */
const base = process.env.BASE_PATH || './';

// `--mode single` produces one self-contained HTML file (used for hosted artifact builds).
// `--mode sandbox-single` produces the Developer Sandbox as one local HTML file
// (developer tools included; git-ignored and never deployed).
export default defineConfig(({ mode }) => ({
  base: mode === 'single' || mode === 'sandbox' || mode === 'sandbox-single' ? './' : base,
  // Developer tools exist only in development and sandbox modes; the public
  // production and single-file builds compile them out entirely.
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __DEV_TOOLS__: JSON.stringify(mode === 'development' || mode === 'sandbox' || mode === 'sandbox-single') },
  plugins: mode === 'single' || mode === 'sandbox-single' ? [viteSingleFile()] : [serviceWorkerVersion()],
  build: {
    outDir: mode === 'single' ? 'dist-single' : mode === 'sandbox' ? 'dist-sandbox' : mode === 'sandbox-single' ? 'dist-sandbox-single' : 'dist',
    chunkSizeWarningLimit: 2000,
    target: 'es2022',
  },
}));
