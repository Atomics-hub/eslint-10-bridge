import {fixupConfig, fixupParser} from 'eslint-10-bridge';
import type {ConfigInput} from 'eslint-10-bridge';
import type {Linter} from 'eslint';

declare const parser: Linter.Parser;
const bridged: Linter.Parser = fixupParser(parser);
const nested: Linter.Config[] = fixupConfig([{rules: {'no-undef': 'error'}}, [{languageOptions: {parser}}]]);
const single: Linter.Config[] = fixupConfig({rules: {}});
const input: ConfigInput = [[{files: ['**/*.js']}]];
void [bridged, nested, single, input];
