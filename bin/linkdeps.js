#!/usr/bin/env node

"use strict";

var program = require("commander");
var runLinkDeps = require("..");
var pkg = require("../package.json");

program
  .version(pkg.version)
  .usage("[options] [dir]")
  .description(pkg.description)
  .option("--devel", [
    "devel mode update (default)",
    "    1) Adds own regular dependencies (from 'linkdeps.own')",
    "    2) Recursively adds regular dependencies of local packages",
    "    3) Recursively creates symlink in 'node_modules' to local packages"
  ].join("\n"))
  .option("--deploy", [
    "deploy mode update",
    "    1) Adds own regular dependencies",
    "    2) Recursively adds local packages with 'file:' prefix"
  ].join("\n"))
  .option("--deploy-mix", [
    "deploy mode update with public & private mixed",
    "    1) Adds own regular dependencies",
    "    2) Adds public local packages with name and '^version' ",
    "       from their package.json",
    "    3) Recursively adds private local packages with 'file:' prefix"
  ].join("\n"))
  .option("--publish", [
    "publish mode update",
    "    1) Adds own regular dependencies",
    "    2) Adds public local packages with name and '^version' ",
    "       from their package.json",
    "       * a private local package causes an error"
  ].join("\n"))
  .option("--link", "do #3 of devel mode only")
  .option("--save", "write output")
  .option("--refs", "show references")
  .option("--out <dir>", "set output dir")
  .parse(process.argv);

var options = {
  mode: (function() {
    if (program.deploy)
      return "deploy";
    else if (program.deployMix)
      return "deploy-mix";
    else if (program.publish)
      return "publish";
    else if (program.link)
      return "link";
    else
      return "devel";
  })(),
  srcPath: program.args[0],
  desPath: program.out,
  check: !program.save,
  refs: program.refs
};

runLinkDeps(options).catch(function(err) {
  console.error(err);
  process.exit(1);
});
