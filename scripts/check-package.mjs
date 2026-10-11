// Exercise the actual tarballs outside this workspace: no TS sources or path aliases.
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'mutant-consumer-'));
function run(cmd, args, cwd = dir) {
  if (cmd === 'npm') { args = [process.env.npm_execpath, ...args]; cmd = process.execPath; }
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
const packs = ['core', 'view'].map(p => {
  const result = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', dir], join(root, 'packages', p)));
  return join(dir, result[0].filename);
});
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...packs]);
const consumer = `
import { strict as assert } from 'node:assert';
import { human, bodyHash, bodyToText, bodyFromText, derive } from '@mutant-engine/core/body';
import { LabRng } from '@mutant-engine/core/rng';
import { MUTATIONS } from '@mutant-engine/core/catalog';
import { drawMutation, applyMutation } from '@mutant-engine/core/mutations';
import { mutationLabel } from '@mutant-engine/core/labels';
import { runBattle } from '@mutant-engine/core/combat';
import { diagnose } from '@mutant-engine/core/surgery';
import { elapse } from '@mutant-engine/core/life';
import { framePng, renderPixels } from '@mutant-engine/view';
function generate() {
  const body = human(), rng = new LabRng(7);
  for (let i = 0; i < 12; i++) {
    const m = drawMutation(MUTATIONS, rng, { body });
    if (m) applyMutation(body, m, rng);
  }
  return body;
}
const body = generate();
assert.equal(bodyHash(body), bodyHash(generate()));
assert.equal(bodyHash(body), bodyHash(bodyFromText(bodyToText(body))));
assert.ok(derive(body));
assert.ok(diagnose(body));
assert.equal(typeof runBattle, 'function');
assert.equal(typeof elapse, 'function');
assert.ok(mutationLabel(MUTATIONS[0].id));
const png = framePng(renderPixels(body, { px: 32 }));
assert.deepEqual([...png.slice(0,8)], [137,80,78,71,13,10,26,10]);
console.log('Installed packages: deterministic mutation, round trip, stats, diagnosis and PNG passed');
`;
writeFileSync(join(dir, 'consumer.mjs'), consumer);
console.log(run(process.execPath, ['consumer.mjs']));
// Type-check installed declarations with NodeNext, outside the development tsconfig.
writeFileSync(join(dir, 'consumer.mts'), consumer.replace("import { strict as assert } from 'node:assert';", 'declare const assert: any;'));
console.log(run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'NodeNext', '--target', 'ES2022', 'consumer.mts']));
console.log('Consumer fixture retained at ' + dir);

writeFileSync(join(dir, 'browser.mjs'), `
import { human, derive } from '@mutant-engine/core/body';
import { framePng, renderPixels } from '@mutant-engine/view';
const b = human();
globalThis.result = { stats: !!derive(b), png: [...framePng(renderPixels(b, {px:32})).slice(0,8)] };
`);
const browser = await build({ entryPoints: [join(dir, 'browser.mjs')], bundle: true, platform: 'browser', format: 'iife', write: false });
const context = { structuredClone };
runInNewContext(browser.outputFiles[0].text, context);
if (!context.result.stats || context.result.png.join(',') !== '137,80,78,71,13,10,26,10') throw new Error('Browser bundle failed');
console.log('Browser bundle works without Node globals or DOM');
