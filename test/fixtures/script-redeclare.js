/* global Promise, myGlobal */
/* exported publicHelper */
var myGlobal = 1;
var Object = 2;
implicitGlobal = 5;
configReadonly = 6;
configWritable = 7;
let scriptLet = 8;
function topLevel() {
  return implicitGlobal + myGlobal + scriptLet + laterVar;
}
function publicHelper() {
  return topLevel();
}
var laterVar = 9;
console.log(typeof Promise, undeclaredInScript);
