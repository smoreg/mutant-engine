import { rmSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
for (const name of ['core', 'view']) {
  const dir = resolve(root, 'packages', name);
  rmSync(resolve(dir, 'dist'), { recursive: true, force: true });
  for (const file of readdirSync(dir).filter(f => f.endsWith('.tsbuildinfo'))) {
    rmSync(resolve(dir, file));
  }
}
rmSync(resolve(root, 'out'), { recursive: true, force: true });
