# Changelog

## 0.1.0

First release.

- `fixupConfig(config)` makes a flat config usable with ESLint 10: `@eslint/compat`'s rule fixups,
  plus a bridge for every parser whose scope manager lacks `addGlobals`.
- `fixupParser(parser)` adds `addGlobals` to parsers such as `@babel/eslint-parser` 7 and the copy
  inside `eslint-config-next`, doing what ESLint 9 did after parsing.
- Checked against ESLint 9.39.5 and against ESLint 10's own parser, and on all 230 apps in the
  Next.js repository's `examples/` folder, with no differences.
