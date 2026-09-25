// Lints every app in the Next.js repository's examples/ folder twice, with ESLint 9 as released and
// with ESLint 10 through this package, and reports every difference. Not part of `npm test`: it
// needs git and network access, and takes a minute.
//
//   node scripts/differential-next-examples.mjs [path-to-a-next.js-checkout] [report.json]
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {mkdtemp, readdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join, relative} from 'node:path';
import {fixupConfig} from '../src/index.js';

const require = createRequire(import.meta.url);
const {ESLint: ESLint9} = require('eslint9');
const {ESLint: ESLint10} = require('eslint');
const globals = require('globals');
const nextVitals = require('eslint-config-next/core-web-vitals');

let checkout = process.argv[2];
if (!checkout) {
  checkout = join(await mkdtemp(join(tmpdir(), 'next-examples-')), 'next.js');
  execFileSync('git', ['clone', '--quiet', '--depth', '1', '--filter=blob:none', '--sparse', 'https://github.com/vercel/next.js.git', checkout]);
  execFileSync('git', ['sparse-checkout', 'set', 'examples'], {cwd: checkout});
}
const examples = join(checkout, 'examples');
if (!existsSync(examples)) throw new Error(`no examples/ folder in ${checkout}`);
const commit = execFileSync('git', ['log', '-1', '--format=%H %cs'], {cwd: checkout, encoding: 'utf8'}).trim();

// The same extra rules as the tests, so the global-variable machinery is exercised on every file.
const config = [
  ...nextVitals,
  {settings: {next: {rootDir: examples}}},
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {globals: {...globals.browser, ...globals.node}},
    rules: {'no-undef': 'error', 'no-unused-vars': 'warn', 'no-redeclare': 'error', 'no-global-assign': 'error'},
  },
];

const lint = async (ESLint, overrideConfig) => {
  const results = await new ESLint({cwd: examples, overrideConfigFile: true, overrideConfig}).lintFiles(['.']);
  return new Map(results.map((result) => [relative(examples, result.filePath), result.messages.map(
    ({ruleId, severity, message, line, column, endLine, endColumn, fix, suggestions}) =>
      JSON.stringify({ruleId, severity, message, line, column, endLine, endColumn, fix, suggestions}),
  )]));
};

let unbridged = 'no crash';
try {
  await new ESLint10({cwd: examples, overrideConfigFile: true, overrideConfig: config}).lintFiles(['.']);
} catch (error) {
  unbridged = String(error.message).split('\n')[0];
}

const before = await lint(ESLint9, config);
const after = await lint(ESLint10, fixupConfig(config));

const differences = [];
for (const file of new Set([...before.keys(), ...after.keys()])) {
  const a = before.get(file) ?? [];
  const b = after.get(file) ?? [];
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    differences.push({file, onlyESLint9: a.filter((m) => !b.includes(m)), onlyBridged: b.filter((m) => !a.includes(m))});
  }
}

const count = (map) => [...map.values()].reduce((sum, messages) => sum + messages.length, 0);
const report = {
  nextjsCommit: commit,
  apps: (await readdir(examples, {withFileTypes: true})).filter((entry) => entry.isDirectory()).length,
  files: before.size,
  eslint9: ESLint9.version,
  eslint10: ESLint10.version,
  eslintConfigNext: JSON.parse(readFileSync(new URL('../node_modules/eslint-config-next/package.json', import.meta.url), 'utf8')).version,
  eslint10WithoutBridge: unbridged,
  messages: {eslint9: count(before), bridged: count(after)},
  filesThatDiffer: differences.length,
  differences,
};
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({...report, differences: differences.slice(0, 5)}, null, 2));
process.exitCode = differences.length === 0 ? 0 : 1;
