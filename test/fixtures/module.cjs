const path = require("path");
const fs = require("fs");
module.exports = function join(a) {
  return path.join(a, __dirname, process.cwd(), notDefined);
};
