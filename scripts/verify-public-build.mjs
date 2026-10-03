// Fails if a public build contains developer-only code: the developer panel,
// the sandbox, the morph gallery or the console API. Run after `vite build`.
// Usage: node scripts/verify-public-build.mjs <dir> [<dir>...]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MARKERS = [
  'Developer Panel',
  'Developer Sandbox',
  'Sandbox tools',
  'morph gallery',
  'Spawn customer with goal',
  '__tidepool',
  'dev/devPanel',
  'dev/sandbox',
];

const dirs = process.argv.slice(2);
if (!dirs.length) dirs.push('dist');
let problems = 0;
let files = 0;
const walk = (d) => {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css|mjs|json|webmanifest)$/.test(name)) {
      files++;
      const text = readFileSync(p, 'utf8');
      for (const m of MARKERS) if (text.includes(m)) {
        console.error(`DEV CODE IN PUBLIC BUILD: "${m}" found in ${p}`);
        problems++;
      }
    }
  }
};
for (const d of dirs) walk(d);
if (!files) {
  console.error('No built files found. Run the build first.');
  process.exit(1);
}
if (problems) process.exit(1);
console.log(`Public build clean: ${files} files checked in ${dirs.join(', ')}, no developer tools, sandbox or console API.`);
