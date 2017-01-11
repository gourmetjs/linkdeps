"use strict";

var npath = require("path");
var fs = require("fs");
var mkdirp = require("mkdirp");
var template = require("lodash.template");
var shouldBuild = require("./shouldBuild");

module.exports = function renderTemplate(src, out, context, options) {
  options = options || {};

  if (!options.forceRebuild && !shouldBuild(src, out))
    return;

  if (Array.isArray(src))
    src = src[0];

  if (!options.silent)
    console.log("renderTemplate:", out);

  var content = fs.readFileSync(src, {encoding: "utf8"});
  context = Object.assign({
    include: function(path) {
      path = npath.resolve(npath.dirname(src), path);
      var text = fs.readFileSync(path, {encoding: "utf8"});
      return template(text)(context);
    }
  }, context);
  var output = template(content)(context);
  mkdirp.sync(npath.dirname(out));
  fs.writeFileSync(out, output, {encoding: "utf8"});
};
