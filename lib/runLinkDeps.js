"use strict";

var LinkDeps = require("./LinkDeps");

module.exports = function runLinkDeps(options) {
  var linkdeps = new LinkDeps(options);
  return linkdeps.run();
};
