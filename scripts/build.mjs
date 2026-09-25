import {mkdir, readFile, writeFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('src/index.js', root), 'utf8');
const declarations = await readFile(new URL('src/index.d.ts', root), 'utf8');

const exported = [...source.matchAll(/^export (?:const |function )(\w+)/gm)].map((match) => match[1]);
const expected = ['fixupConfig', 'fixupParser'];
if (exported.slice().sort().join(',') !== expected.join(',')) {
  throw new Error('Review build exports: ' + exported.join(','));
}

// The CommonJS build rewrites imports into requires and nothing else, so every import has to be one
// whose CommonJS entry exposes the same names. @eslint/compat ships both builds.
const allowed = new Set(['@eslint/compat']);
const imports = [...source.matchAll(/^import\s+(.+?)\s+from\s+'([^']+)';$/gm)];
for (const [, , specifier] of imports) {
  if (!specifier.startsWith('node:') && !allowed.has(specifier)) {
    throw new Error('unsupported import in the CommonJS build: ' + specifier);
  }
}
if (/^export \{|^export default/m.test(source)) throw new Error('re-exports are not supported by this build');

await mkdir(new URL('dist/', root), {recursive: true});
await writeFile(new URL('dist/index.mjs', root), source);

const commonjs = source
  .replace(/^import\s+(.+?)\s+from\s+'([^']+)';$/gm, (whole, binding, specifier) => {
    const named = binding.startsWith('{') ? binding.replace(/\bas\b/g, ':') : binding;
    return `const ${named} = require('${specifier}');`;
  })
  .replace(/^export /gm, '');
await writeFile(new URL('dist/index.cjs', root),
  "'use strict';\n" + commonjs + '\nmodule.exports = {' + exported.join(', ') + '};\n');

for (const extension of ['mts', 'cts']) {
  await writeFile(new URL('dist/index.d.' + extension, root), declarations);
}
