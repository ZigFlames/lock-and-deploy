// Zero-dependency build: copy the static app into dist/ and stamp the service-worker cache version.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const include = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons'];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const p of include) cpSync(join(root, p), join(dist, p), { recursive: true });

// Hash app files so every content change busts the offline cache.
const hash = createHash('sha256');
const walk = (d) => readdirSync(d).sort().forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : hash.update(readFileSync(p)); });
walk(dist);
const version = hash.digest('hex').slice(0, 10);
const sw = join(dist, 'sw.js');
writeFileSync(sw, readFileSync(sw, 'utf8').replace('__BUILD__', version));
writeFileSync(join(dist, '.nojekyll'), '');
writeFileSync(join(dist, '404.html'), readFileSync(join(dist, 'index.html')));
console.log(`Built dist/ (cache version ld-${version})`);
