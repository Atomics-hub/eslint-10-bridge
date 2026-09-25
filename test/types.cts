import bridge = require('eslint-10-bridge');
import type {Linter} from 'eslint';

declare const parser: Linter.Parser;
const bridged: Linter.Parser = bridge.fixupParser(parser);
const configs: Linter.Config[] = bridge.fixupConfig([{languageOptions: {parser}}]);
void [bridged, configs];
