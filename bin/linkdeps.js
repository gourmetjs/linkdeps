#!/usr/bin/env node

"use strict";

var createLinkDepsContext = require("..");

(function main() {
  var linkctx = createLinkDepsContext();
  var argv = linkctx.argv;

  if (argv.version) {
    console.log(require("../package.json").version);
    return;
  }

  if (argv.help) {
    console.log([
      "Usage: linkdeps [<input_dir>] [options]",
      "",
      "Options:",
      "  --version   print the version number",
      "  -h, --help  print this help message",
      "  --devel     devel mode update (default)",
      "               1) Adds own regular dependencies (from 'linkdeps.own')",
      "               2) Recursively adds regular dependencies of local packages",
      "               3) Recursively creates symlink in 'node_modules' to local packages",
      "  --deploy    deploy mode update",
      "               1) Adds own regular dependencies",
      "               2) Recursively adds local packages with 'file:' prefix",
      "  --deploy-mix  deploy mode update with public & private mixed",
      "               1) Adds own regular dependencies",
      "               2) Adds public local packages with name and '^version' ",
      "                  from their package.json",
      "               3) Recursively adds private local packages with 'file:' prefix",
      "  --publish   publish mode update",
      "               1) Adds own regular dependencies",
      "               2) Adds public local packages with name and '^version' ",
      "                  from their package.json",
      "                  * a private local package causes an error",
      "  --link      do #3 of devel mode only",
      "  --check     check only, no output writing",
      "  --out=dir   set output dir"
    ].join("\n"));
    return;
  }

  linkctx.run().catch(function(err) {
    setImmediate(function() {
      throw err;
    });
  });
})();
