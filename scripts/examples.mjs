import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(import.meta.resolve('vite-node/cli'));
for (const name of readdirSync(new URL('../examples/', import.meta.url)).filter(f => f.endsWith('.ts')).sort()) {
  console.log(`== examples/${name}`);
  execFileSync(process.execPath, [cli, `examples/${name}`], { stdio: 'inherit' });
}
