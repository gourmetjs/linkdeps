"use strict";

var LinkDepsContext = require("./LinkDepsContext");

module.exports = function createLinkDepsContext(options) {
  return new LinkDepsContext(options);
};
