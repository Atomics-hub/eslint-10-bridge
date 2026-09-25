// The claim: through the bridge, ESLint 10 reports exactly what ESLint 9 reported with the same
// config, down to positions, messages, fixes and suggestions, and autofix produces the same text.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixupConfig} from '../src/index.js';
import {Linter9, Linter10, babelConfig, comparable, fixtureFiles, nextConfig} from './setups.mjs';

const setups = {'@babel/eslint-parser 7': babelConfig, 'eslint-config-next core-web-vitals': nextConfig};

for (const [label, config] of Object.entries(setups)) {
  for (const file of fixtureFiles()) {
    test(`${label}: ${file.name} lints the same under ESLint 9 and bridged ESLint 10`, () => {
      const before = new Linter9().verify(file.code, config(), file.filename);
      const after = new Linter10().verify(file.code, fixupConfig(config()), file.filename);
      assert.deepEqual(comparable(after), comparable(before));
    });

    test(`${label}: ${file.name} autofixes to the same text`, () => {
      const before = new Linter9().verifyAndFix(file.code, config(), {filename: file.filename});
      const after = new Linter10().verifyAndFix(file.code, fixupConfig(config()), {filename: file.filename});
      assert.equal(after.output, before.output);
      assert.equal(after.fixed, before.fixed);
    });
  }
}

// A second reference: ESLint 10 with its own parser, espree, which needs no bridge. Where a fixture
// has no JSX, the bridged Babel parser has to give ESLint 10's own answers, not just ESLint 9's.
const withoutParser = () => babelConfig().map(({languageOptions: {parser, parserOptions, ...rest} = {}, ...entry}) => ({...entry, languageOptions: rest}));
for (const file of fixtureFiles().filter((candidate) => !candidate.name.endsWith('.jsx'))) {
  test(`@babel/eslint-parser 7: ${file.name} matches ESLint 10's own parser`, () => {
    const native = new Linter10().verify(file.code, withoutParser(), file.filename);
    const bridged = new Linter10().verify(file.code, fixupConfig(babelConfig()), file.filename);
    assert.deepEqual(comparable(bridged), comparable(native));
  });
}

test('the fixtures exercise every scope rule, so an empty result could not pass by accident', () => {
  const seen = new Set();
  for (const config of Object.values(setups)) {
    for (const file of fixtureFiles()) {
      for (const message of new Linter9().verify(file.code, config(), file.filename)) seen.add(message.ruleId);
    }
  }
  for (const rule of ['no-undef', 'no-unused-vars', 'no-global-assign', 'no-redeclare', 'no-shadow', 'no-implicit-globals', 'prefer-const']) {
    assert.ok(seen.has(rule), `no fixture triggers ${rule}`);
  }
  for (const rule of ['react/jsx-key', '@next/next/no-img-element']) {
    assert.ok(seen.has(rule), `no fixture triggers ${rule}`);
  }
});
