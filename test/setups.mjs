// Shared lint setups for the tests: the same configs run under ESLint 9 unchanged and under ESLint
// 10 through the bridge, so any difference in output is the bridge's doing.
import {readFileSync, readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
export const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

export const babelParser = require('@babel/eslint-parser');
const globals = require('globals');
const {Linter: Linter9} = require('eslint9');
const {Linter: Linter10} = require('eslint');
export {Linter9, Linter10};

// Every core rule whose answer depends on which globals exist and how references resolve.
const scopeRules = {
  'no-undef': 'error',
  'no-unused-vars': 'warn',
  'no-global-assign': 'error',
  'no-redeclare': ['error', {builtinGlobals: true}],
  'no-shadow': ['error', {builtinGlobals: true, hoist: 'all'}],
  'no-implicit-globals': 'error',
  'no-restricted-globals': ['error', 'event'],
  'no-use-before-define': 'error',
  'prefer-const': 'warn',
};

const configGlobals = {configReadonly: 'readonly', configWritable: 'writable', configOff: 'off'};

export function babelConfig() {
  return [
    {
      files: ['**/*.{js,jsx,cjs}'],
      languageOptions: {
        parser: babelParser,
        parserOptions: {requireConfigFile: false, babelOptions: {babelrc: false, configFile: false, presets: ['@babel/preset-react']}},
        globals: {...globals.browser, ...configGlobals},
      },
      rules: scopeRules,
    },
    {files: ['**/script-*.js'], languageOptions: {sourceType: 'script'}},
    {files: ['**/*.cjs'], languageOptions: {sourceType: 'commonjs', globals: globals.node}},
  ];
}

export function nextConfig() {
  const nextVitals = require('eslint-config-next/core-web-vitals');
  return [
    ...nextVitals,
    {files: ['**/*.{js,jsx,cjs}'], languageOptions: {globals: {...globals.browser, ...configGlobals}}, rules: scopeRules},
    {files: ['**/script-*.js'], languageOptions: {sourceType: 'script'}},
    {files: ['**/*.cjs'], languageOptions: {sourceType: 'commonjs', globals: globals.node}},
  ];
}

export function fixtureFiles() {
  return readdirSync(fixtures).sort().map((name) => ({name, filename: fixtures + name, code: readFileSync(fixtures + name, 'utf8')}));
}

// Everything a rule reports that a user or an editor would act on.
export function comparable(messages) {
  return messages.map(({ruleId, severity, message, line, column, endLine, endColumn, fix, suggestions}) => ({
    ruleId, severity, message, line, column, endLine, endColumn, fix, suggestions,
  }));
}
