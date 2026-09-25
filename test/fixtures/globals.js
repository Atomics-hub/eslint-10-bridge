/* global inlineReadonly, inlineWritable: writable */
const width = window.innerWidth + document.title.length;
console.log(width, inlineReadonly, inlineWritable, configReadonly, configWritable, configOff);
inlineReadonly = 1;
inlineWritable = 2;
configReadonly = 3;
configWritable = 4;
undefinedThing + 1;
let unusedLocal = 1;
export function shadow() {
  const window = 1;
  const Promise = 2;
  return window + Promise;
}
