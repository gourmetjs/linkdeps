"use strict";

var LinkDepsContext = require("./LinkDepsContext");

module.exports = function createLinkDepsContext(options) {
  var linkctx = new LinkDepsContext();
  if (!options)
    options = linkctx.parseArgv();
  linkctx.prepare(options);
  return linkctx;
};
