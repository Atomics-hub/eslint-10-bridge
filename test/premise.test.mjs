// The problem the package exists for, pinned so the README can't drift from it: ESLint 10 cannot lint
// a single file with these configs, and @eslint/compat on its own does not change that.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixupConfigRules} from '@eslint/compat';
import {Linter10, babelConfig, fixtureFiles, nextConfig} from './setups.mjs';

const [clean] = fixtureFiles().filter((file) => file.name === 'clean.js');
const crash = /scopeManager\.addGlobals is not a function/;

test('ESLint 10 crashes on @babel/eslint-parser 7', () => {
  assert.throws(() => new Linter10().verify(clean.code, babelConfig(), clean.filename), crash);
});

test('ESLint 10 crashes on eslint-config-next', () => {
  assert.throws(() => new Linter10().verify(clean.code, nextConfig(), clean.filename), crash);
});

test('@eslint/compat alone does not fix either', () => {
  assert.throws(() => new Linter10().verify(clean.code, fixupConfigRules(babelConfig()), clean.filename), crash);
  assert.throws(() => new Linter10().verify(clean.code, fixupConfigRules(nextConfig()), clean.filename), crash);
});
