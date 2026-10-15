# eslint-10-bridge

Run ESLint 10 on configs built for ESLint 9, including Next.js's `eslint-config-next` and
`@babel/eslint-parser` 7.

> **Next.js 16.4 fixes this itself.** `eslint-config-next` 16.4.0 (2026-10-06,
> [vercel/next.js#99628](https://github.com/vercel/next.js/pull/99628)) adds its own `addGlobals`
> support and lints under ESLint 10 without this package: checked with ESLint 10.12.0 on a JSX file
> with a `/* global */` comment, where the `react`, `jsx-a11y` and `@next` rules all ran. On
> `eslint-config-next` 16.4 or later, remove this package. It is still needed for `eslint-config-next`
> 16.3 and earlier, and for `@babel/eslint-parser` 7 outside Next.js (`@babel/eslint-parser` 8
> supports ESLint 10 but needs Babel 8).

If ESLint 10 stops with either of these errors, this package fixes it:

```
TypeError: scopeManager.addGlobals is not a function
```

```
TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function
```

## Next.js

```sh
npm install --save-dev eslint-10-bridge
```

In the `eslint.config.mjs` that create-next-app generates, import `fixupConfig` and wrap the export:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { fixupConfig } from "eslint-10-bridge";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default fixupConfig(eslintConfig);
```

## @babel/eslint-parser 7

```js
import babelParser from "@babel/eslint-parser";
import { fixupConfig } from "eslint-10-bridge";

export default fixupConfig([
  {
    languageOptions: {
      parser: babelParser,
      parserOptions: { requireConfigFile: false },
    },
  },
]);
```

npm also refuses to install that parser alongside ESLint 10 (`ERESOLVE`), because its peer range
stops at ESLint 9. The same goes for `eslint-plugin-import` 2.32 and `eslint-plugin-jsx-a11y` 6.10,
whose rules run under ESLint 10 through `fixupConfig` once they are installed. Add an override to
`package.json` for each one you use, so it accepts your ESLint:

```json
"overrides": {
  "@babel/eslint-parser": { "eslint": "$eslint" },
  "eslint-plugin-import": { "eslint": "$eslint" },
  "eslint-plugin-jsx-a11y": { "eslint": "$eslint" }
}
```

## Why ESLint 10 breaks

ESLint 10 moved part of its global-variable setup into the parser's scope manager. Before linting a
file it calls `scopeManager.addGlobals(names)`. `@babel/eslint-parser` 7 builds its scopes with
eslint-scope 5, which has no such method, and `eslint-config-next` ships its own copy of that
parser, so every JavaScript file it parses fails. Babel 8's parser supports ESLint 10, but it needs
Babel 8, and 98% of `@babel/eslint-parser` downloads in the last week were 7.x (npm per-version
counts, retrieved 2026-09-24).

The second error comes from plugins written against ESLint 9's rule API, here eslint-plugin-react's
React version detection. ESLint's own [`@eslint/compat`](https://www.npmjs.com/package/@eslint/compat)
repairs those, and `fixupConfig` applies it for you. On its own, `@eslint/compat` does not fix the
parser.

Reported upstream in [vercel/next.js#89764](https://github.com/vercel/next.js/issues/89764) (open
since 2026-02-10) and [babel/babel#17934](https://github.com/babel/babel/issues/17934).

## What it does

- `fixupConfig(config)` applies `@eslint/compat`'s `fixupConfigRules`, then `fixupParser` to every
  parser in the config. It takes a config object or an array, nested or not, and returns a flat
  array.
- `fixupParser(parser)` returns a copy of the parser whose scope managers get `addGlobals` when they
  lack it. The method does what ESLint 9 did itself after parsing. It declares the globals, resolves
  the references waiting for them and for the file's own top-level declarations, and stops treating
  those names as implicit globals. Parsers that already support ESLint 10 pass through unchanged, so
  leaving the bridge in after your parser catches up does no harm.

## How it was checked

- **Against ESLint 9.** The test suite lints the same files under ESLint 9.39.5 and under ESLint
  10.11.0 with the bridge, and requires identical results: rule, position, message, fix and
  suggestions, plus the autofixed text. The fixtures cover configured globals (read-only, writable
  and off), `/* global */` and `/* exported */` comments, redeclared built-ins, implicit globals in
  scripts, CommonJS and JSX, under both `@babel/eslint-parser` 7 and `eslint-config-next`.
- **Against ESLint 10's own parser.** For the fixtures without JSX, the bridged Babel parser gives
  the same results as ESLint 10's default parser, which needs no bridge.
- **On real code.** Every app in the Next.js repository's `examples/` folder (commit `b9be068`,
  2026-09-24: 230 apps, 2,188 files) produces 264 messages under ESLint 9 and the same 264 under
  bridged ESLint 10. No file differs. Without the bridge, ESLint 10 crashes. Reproduce with
  `node scripts/differential-next-examples.mjs`.

## Limits

- It supplies the scope method ESLint 10 asks for. It does not change what Babel 7 can parse.
- Rule fixes are whatever `@eslint/compat` restores. A plugin broken by some other ESLint 10 change
  stays broken.
- Tested with ESLint 10.11.0, `eslint-config-next` 16.3.6 and `@babel/eslint-parser` 7.29.9.
- Not affiliated with ESLint, Babel, Next.js or Vercel.

## Install

```sh
npm install --save-dev eslint-10-bridge
```

Node `^20.19.0 || ^22.13.0 || >=24`, the same as ESLint 10. ESM and CommonJS, with TypeScript types.
One dependency, `@eslint/compat`.

## License

MIT
