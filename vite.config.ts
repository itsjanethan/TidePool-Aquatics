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

// `--mode single` produces one self-contained HTML file (used for hosted artifact builds).
export default defineConfig(({ mode }) => ({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: mode === 'single' ? [viteSingleFile()] : [serviceWorkerVersion()],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 2000,
    target: 'es2022',
  },
}));
