// Packs the tarball, installs it into a fresh project next to ESLint 10 and @babel/eslint-parser 7,
// and checks the published build does the job from both ESM and CommonJS.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = join(root, 'artifacts');
await mkdir(artifacts, {recursive: true});
const run = (command, args, cwd) => execFileSync(command, args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
// npm sets its CLI path during npm run. Launch through Node to avoid shell quoting and .cmd behaviour
// for Windows paths containing spaces.
const runNpm = (args, cwd) => process.env.npm_execpath
  ? run(process.execPath, [process.env.npm_execpath, ...args], cwd)
  : run('npm', args, cwd);

const [packed] = JSON.parse(runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', artifacts], root));
assert.deepEqual(packed.files.map((file) => file.path).sort(), [
  'LICENSE', 'README.md', 'dist/index.cjs', 'dist/index.d.cts', 'dist/index.d.mts', 'dist/index.mjs', 'package.json',
]);
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.deepEqual(Object.keys(manifest.dependencies), ['@eslint/compat']);
assert.deepEqual(Object.keys(manifest.peerDependencies), ['eslint']);
assert.equal(manifest.optionalDependencies, undefined);

const consumer = await mkdtemp(join(tmpdir(), 'eslint-10-bridge-consumer-'));
await writeFile(join(consumer, 'package.json'), JSON.stringify({
  private: true,
  type: 'module',
  overrides: {'@babel/eslint-parser': {eslint: '$eslint'}},
}));
runNpm(['install', '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund',
  join(artifacts, packed.filename), 'eslint@^10', '@babel/eslint-parser@^7', '@babel/core@^7'], consumer);

const script = `import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as esm from 'eslint-10-bridge';
const require = createRequire(import.meta.url);
const cjs = require('eslint-10-bridge');
const {Linter} = require('eslint');
const parser = require('@babel/eslint-parser');
assert.deepEqual(Object.keys(esm).sort(), ['fixupConfig', 'fixupParser']);
assert.deepEqual(Object.keys(cjs).sort(), ['fixupConfig', 'fixupParser']);
const config = [{
  languageOptions: {parser, parserOptions: {requireConfigFile: false}, globals: {window: 'readonly'}},
  rules: {'no-undef': 'error'},
}];
const code = 'window.title = missing;';
assert.throws(() => new Linter().verify(code, config, 'a.js'), /scopeManager\\.addGlobals is not a function/);
const results = {};
for (const [name, api] of Object.entries({esm, cjs})) {
  const messages = new Linter().verify(code, api.fixupConfig(config), 'a.js');
  assert.deepEqual(messages.map((message) => message.message), ["'missing' is not defined."], name);
  results[name] = messages.length;
}
console.log(JSON.stringify({eslint: new Linter().version, results}));
`;
await writeFile(join(consumer, 'consumer.mjs'), script);
const checks = JSON.parse(run(process.execPath, ['consumer.mjs'], consumer));

for (const name of ['types.mts', 'types.cts', 'tsconfig.json']) {
  await cp(join(root, 'test', name), join(consumer, name));
}
run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(consumer, 'tsconfig.json')], consumer);

const report = {packed, consumer, checks, types: 'ESM and CommonJS consumers passed'};
await writeFile(join(artifacts, 'pack.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({tarball: resolve(artifacts, packed.filename), size: packed.size, unpackedSize: packed.unpackedSize, files: packed.files.length, consumer, types: report.types, checks}));
