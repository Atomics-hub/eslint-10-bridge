// Run ESLint 10 with parsers and plugins that were written for ESLint 9.
//
// ESLint 10 moved global-variable setup into the parser's scope manager: before linting a file it
// calls `scopeManager.addGlobals(names)`. Parsers that build their scopes with an older eslint-scope,
// such as @babel/eslint-parser 7 and the copy of it inside eslint-config-next, have no such method,
// so every file they parse fails with "scopeManager.addGlobals is not a function". Rules written
// against ESLint 9's context API fail too, which @eslint/compat already repairs.
import {fixupConfigRules} from '@eslint/compat';

// Does what ESLint 9 did itself after parsing, in lib/languages/js/source-code/source-code.js:
// declare each global, then resolve every reference still waiting at the global scope whose name is
// now declared there, and stop treating those names as implicit globals.
//
// Resolving by what the global scope holds, not only by the names passed in, matters in scripts. An
// older eslint-scope leaves references to a script's own top-level `var` and function declarations
// unresolved, and ESLint 9 resolved them here. ESLint 10's eslint-scope resolves them while it
// analyses the file, so ESLint 10 no longer does; without this, `function a() {}` called from
// another function in a script is reported as undefined.
function declareGlobals(scopeManager, names) {
  const globalScope = scopeManager.globalScope ?? scopeManager.scopes?.[0];
  if (!globalScope) {
    throw new TypeError('eslint-10-bridge: the parser returned a scope manager without a global scope');
  }

  for (const name of names) {
    if (globalScope.set.has(name)) continue;
    if (typeof globalScope.__defineGeneric === 'function') {
      globalScope.__defineGeneric(name, globalScope.set, globalScope.variables, null, null);
    } else {
      const variable = {name, scope: globalScope, identifiers: [], references: [], defs: [], tainted: false, stack: true};
      globalScope.set.set(name, variable);
      globalScope.variables.push(variable);
    }
  }

  globalScope.through = globalScope.through.filter((reference) => {
    const variable = globalScope.set.get(reference.identifier.name);
    if (!variable) return true;
    reference.resolved = variable;
    variable.references.push(reference);
    return false;
  });

  const {implicit} = globalScope;
  if (typeof implicit === 'object' && implicit !== null) {
    implicit.variables = implicit.variables.filter((variable) => {
      if (!globalScope.set.has(variable.name)) return true;
      implicit.set.delete(variable.name);
      return false;
    });
    if (implicit.left) {
      implicit.left = implicit.left.filter((reference) => !globalScope.set.has(reference.identifier.name));
    }
  }
}

const bridges = new WeakMap();
const bridged = new WeakSet();

/**
 * A copy of `parser` whose scope managers have the `addGlobals` method ESLint 10 calls. Parsers
 * that already provide it, and parsers without `parseForESLint` (ESLint analyses those itself), are
 * returned unchanged.
 */
export function fixupParser(parser) {
  if (!parser || typeof parser.parseForESLint !== 'function' || bridged.has(parser)) return parser;
  const existing = bridges.get(parser);
  if (existing) return existing;

  const bridge = {
    ...parser,
    parseForESLint(code, options) {
      const result = parser.parseForESLint(code, options);
      const scopeManager = result?.scopeManager;
      if (scopeManager && typeof scopeManager.addGlobals !== 'function') {
        scopeManager.addGlobals = function addGlobals(names) {
          declareGlobals(this, names);
        };
      }
      return result;
    },
  };
  bridges.set(parser, bridge);
  bridged.add(bridge);
  return bridge;
}

/**
 * Makes a flat config usable with ESLint 10: repairs rules written for ESLint 9's context API with
 * @eslint/compat's `fixupConfigRules`, then bridges every parser the config names. Accepts a config
 * object or an array, nested or not, and returns a flat array.
 */
export function fixupConfig(config) {
  const configs = fixupConfigRules([config].flat(Infinity));
  return configs.map((entry) => {
    const parser = entry?.languageOptions?.parser;
    if (!parser) return entry;
    const bridge = fixupParser(parser);
    return bridge === parser ? entry : {...entry, languageOptions: {...entry.languageOptions, parser: bridge}};
  });
}
