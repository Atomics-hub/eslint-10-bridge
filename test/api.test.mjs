import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, rm, writeFile} from 'node:fs/promises';
import {join, relative, sep} from 'node:path';
import {ESLint} from 'eslint';
import {fixupConfig, fixupParser} from '../src/index.js';
import {babelParser} from './setups.mjs';

// A parser whose scope manager is built by hand, so each branch can be checked in isolation.
function fakeParser({withAddGlobals = false, withDefineGeneric = true, globalScope = true} = {}) {
  return {
    meta: {name: 'fake', version: '1.0.0'},
    parse() {},
    parseForESLint(code) {
      const through = code.split(',').map((name) => ({identifier: {name}, resolved: null}));
      const scope = {
        set: new Map(),
        variables: [],
        through,
        implicit: {set: new Map([['leaked', {}]]), variables: [{name: 'leaked'}], left: through.slice()},
      };
      if (withDefineGeneric) {
        scope.__defineGeneric = function (name, set, variables) {
          const variable = {name, scope: this, identifiers: [], references: [], defs: []};
          set.set(name, variable);
          variables.push(variable);
        };
      }
      const scopeManager = {globalScope: globalScope ? scope : null, scopes: globalScope ? [scope] : []};
      if (withAddGlobals) scopeManager.addGlobals = function nativeAddGlobals() {};
      return {ast: {}, scopeManager, visitorKeys: {}, thisValue: this};
    },
  };
}

test('parsers without parseForESLint are returned unchanged', () => {
  const parser = {parse() {}};
  assert.equal(fixupParser(parser), parser);
  assert.equal(fixupParser(undefined), undefined);
});

test('bridging is cached and idempotent', () => {
  const parser = fakeParser();
  const bridge = fixupParser(parser);
  assert.notEqual(bridge, parser);
  assert.equal(fixupParser(parser), bridge);
  assert.equal(fixupParser(bridge), bridge);
});

test('meta and parse are kept, and parseForESLint runs on the original parser', () => {
  const parser = fakeParser();
  const bridge = fixupParser(parser);
  assert.equal(bridge.meta, parser.meta);
  assert.equal(bridge.parse, parser.parse);
  assert.equal(bridge.parseForESLint('a').thisValue, parser);
});

test('a scope manager that already has addGlobals is left alone', () => {
  const {scopeManager} = fixupParser(fakeParser({withAddGlobals: true})).parseForESLint('a');
  assert.equal(scopeManager.addGlobals.name, 'nativeAddGlobals');
});

test('addGlobals declares globals, resolves waiting references, and clears implicit globals', () => {
  for (const withDefineGeneric of [true, false]) {
    const {scopeManager} = fixupParser(fakeParser({withDefineGeneric})).parseForESLint('window,leaked,unknown');
    const globalScope = scopeManager.globalScope;
    scopeManager.addGlobals(['window', 'leaked']);

    assert.deepEqual([...globalScope.set.keys()], ['window', 'leaked']);
    assert.deepEqual(globalScope.through.map((reference) => reference.identifier.name), ['unknown']);
    for (const name of ['window', 'leaked']) {
      const variable = globalScope.set.get(name);
      assert.equal(variable.references.length, 1, name);
      assert.equal(variable.references[0].resolved, variable, name);
    }
    assert.deepEqual(globalScope.implicit.variables, []);
    assert.equal(globalScope.implicit.set.has('leaked'), false);
    assert.deepEqual(globalScope.implicit.left.map((reference) => reference.identifier.name), ['unknown']);
  }
});

test('addGlobals resolves references to names the global scope already declares', () => {
  const {scopeManager} = fixupParser(fakeParser()).parseForESLint('topLevel');
  const globalScope = scopeManager.globalScope;
  globalScope.__defineGeneric('topLevel', globalScope.set, globalScope.variables);
  scopeManager.addGlobals([]);
  assert.deepEqual(globalScope.through, []);
  assert.equal(globalScope.set.get('topLevel').references.length, 1);
});

test('a scope manager without a global scope gets a clear error', () => {
  const {scopeManager} = fixupParser(fakeParser({globalScope: false})).parseForESLint('a');
  assert.throws(() => scopeManager.addGlobals(['a']), /eslint-10-bridge: the parser returned a scope manager without a global scope/);
});

test('fixupConfig takes an object or nested arrays and bridges every parser', () => {
  const parser = fakeParser();
  const plain = {rules: {'no-undef': 'error'}};
  const withParser = {files: ['**/*.js'], languageOptions: {parser, ecmaVersion: 2024}};

  const single = fixupConfig(withParser);
  assert.equal(single.length, 1);
  assert.equal(single[0].languageOptions.parser, fixupParser(parser));
  assert.equal(single[0].languageOptions.ecmaVersion, 2024);
  assert.deepEqual(single[0].files, ['**/*.js']);

  const nested = fixupConfig([plain, [withParser, [plain]]]);
  assert.equal(nested.length, 3);
  assert.equal(nested[0], plain);
  assert.equal(nested[1].languageOptions.parser, fixupParser(parser));
  assert.equal(nested[2], plain);
});

test('fixupConfig twice gives the same parsers as once', () => {
  const config = [{languageOptions: {parser: babelParser}}];
  const once = fixupConfig(config);
  const twice = fixupConfig(once);
  assert.equal(twice[0].languageOptions.parser, once[0].languageOptions.parser);
});

// create-next-app's TypeScript template, verbatim from next.js canary on 2026-09-24
// (packages/create-next-app/templates/app/ts/eslint.config.mjs), except for the two bridge lines.
const template = (bridged) => `import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
${bridged ? 'import { fixupConfig } from "eslint-10-bridge";\n' : ''}
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default ${bridged ? 'fixupConfig(eslintConfig)' : 'eslintConfig'};
`;

test('a create-next-app project crashes on ESLint 10, and lints after the one-line change', async () => {
  // Inside the package, so bare imports resolve the way they do in an app, including this package by
  // its own name.
  const directory = join(import.meta.dirname, '../.tmp', 'next-app');
  await rm(directory, {recursive: true, force: true});
  await mkdir(join(directory, 'app'), {recursive: true});
  try {
    await writeFile(join(directory, 'app/page.tsx'), 'export default function Page({ items }: { items: string[] }) {\n  return <ul>{items.map((item) => <li>{item}</li>)}</ul>;\n}\n');
    await writeFile(join(directory, 'app/legacy.jsx'), 'export default function Legacy() {\n  return <img src="/a.png" />;\n}\n');

    await writeFile(join(directory, 'eslint.config.mjs'), template(false));
    await assert.rejects(new ESLint({cwd: directory}).lintFiles(['.']), /is not a function/);

    await writeFile(join(directory, 'eslint.config.mjs'), template(true));
    const results = await new ESLint({cwd: directory}).lintFiles(['.']);
    const found = Object.fromEntries(results.map((result) => [relative(directory, result.filePath).split(sep).join('/'), result.messages.map((message) => message.ruleId).sort()]));
    assert.deepEqual(found, {
      'app/legacy.jsx': ['@next/next/no-img-element', 'jsx-a11y/alt-text'],
      'app/page.tsx': ['react/jsx-key'],
      'eslint.config.mjs': [],
    });
  } finally {
    await rm(join(import.meta.dirname, '../.tmp'), {recursive: true, force: true});
  }
});

test("the README's @babel/eslint-parser example runs as written", async () => {
  const directory = join(import.meta.dirname, '../.tmp', 'babel-app');
  await rm(directory, {recursive: true, force: true});
  await mkdir(directory, {recursive: true});
  const readmeExample = `import babelParser from "@babel/eslint-parser";
import { fixupConfig } from "eslint-10-bridge";

export default fixupConfig([
  {
    languageOptions: {
      parser: babelParser,
      parserOptions: { requireConfigFile: false },
    },
  },
]);
`;
  try {
    await writeFile(join(directory, 'a.js'), 'export const doubled = [1, 2].map((n) => n * 2);\n');
    await writeFile(join(directory, 'eslint.config.mjs'), readmeExample.replace('fixupConfig([', '([').replace('import { fixupConfig } from "eslint-10-bridge";\n', ''));
    await assert.rejects(new ESLint({cwd: directory}).lintFiles(['a.js']), /scopeManager\.addGlobals is not a function/);

    await writeFile(join(directory, 'eslint.config.mjs'), readmeExample);
    const [result] = await new ESLint({cwd: directory}).lintFiles(['a.js']);
    assert.deepEqual(result.messages, []);
  } finally {
    await rm(join(import.meta.dirname, '../.tmp'), {recursive: true, force: true});
  }
});
