import type {Linter} from 'eslint';

/** A flat config object, or an array of them, nested to any depth. */
export type ConfigInput = Linter.Config | readonly ConfigInput[];

/**
 * A copy of `parser` whose scope managers have the `addGlobals` method ESLint 10 calls. Parsers
 * that already provide it, and parsers without `parseForESLint`, are returned unchanged.
 */
export declare function fixupParser<Parser extends Linter.Parser>(parser: Parser): Parser;

/**
 * Makes a flat config usable with ESLint 10: repairs rules written for ESLint 9's context API with
 * @eslint/compat, then bridges every parser the config names. Returns a flat array.
 */
export declare function fixupConfig(config: ConfigInput): Linter.Config[];
